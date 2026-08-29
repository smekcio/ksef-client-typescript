import { fetch, ProxyAgent, Headers } from "undici";
import type { BodyInit, Dispatcher, RequestInit, Response } from "undici";
import { HttpMethod, JsonObject } from "../types/common";
import { validatePresignedUrlSecurity } from "./presignedUrlPolicy";
import {
  type KsefApiProblem,
  KsefApiError,
  KsefAuthStatusError,
  KsefHttpError,
  KsefRateLimitError,
  KsefValidationError,
  type UnknownApiProblem,
} from "../errors/errors";
import type {
  ApiError,
  BadRequestProblemDetails,
  ExceptionResponse,
  ForbiddenProblemDetails,
  GoneProblemDetails,
  TooManyRequestsProblemDetails,
  TooManyRequestsResponse,
  UnauthorizedProblemDetails,
} from "../types/openapi.generated";

export interface HttpClientOptions {
  baseUrl: string;
  appendV2?: boolean;
  timeoutMs?: number;
  defaultHeaders?: Record<string, string>;
  proxy?: string;
  noProxy?: string;
  retryOn429?: boolean;
  retryOn5xx?: boolean;
  retryOnTimeout?: boolean;
  maxRetryAttempts?: number;
  maxRetryDelayMs?: number;
  strictPresignedUrlValidation?: boolean;
  allowedPresignedHosts?: string[];
  allowPrivateNetworkPresignedUrls?: boolean;
  systemWarningHandler?: (warning: string) => void;
}

export interface RetryOptions {
  retryOn429?: boolean;
  retryOn5xx?: boolean;
  retryOnTimeout?: boolean;
  maxAttempts?: number;
}

export interface HttpRequestOptions {
  method: HttpMethod;
  path: string;
  query?: Record<
    string,
    string | number | boolean | Array<string | number | boolean> | undefined | null
  >;
  headers?: Record<string, string>;
  body?: JsonObject | Record<string, unknown> | object | string | Buffer | Uint8Array;
  responseType?: "json" | "text" | "buffer";
  authToken?: string;
  skipAuth?: boolean;
  retry?: RetryOptions;
}

function normalizeBaseUrl(baseUrl: string, appendV2: boolean): string {
  if (baseUrl.endsWith("/")) {
    baseUrl = baseUrl.slice(0, -1);
  }
  if (!appendV2) {
    return baseUrl;
  }
  return baseUrl.endsWith("/v2") ? baseUrl : `${baseUrl}/v2`;
}

function shouldBypassProxy(hostname: string, noProxy?: string): boolean {
  if (!noProxy) {
    return false;
  }
  const list = noProxy
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (list.includes("*")) {
    return true;
  }
  return list.some((entry) => hostname === entry || hostname.endsWith(`.${entry}`));
}

function isJsonContentType(contentType: string): boolean {
  const mediaType = contentType.split(";", 1)[0]!.trim().toLowerCase();
  return mediaType === "application/json" || mediaType.endsWith("+json");
}

function parseRetryAfterMs(retryAfter: string | undefined): number | undefined {
  if (!retryAfter) {
    return undefined;
  }

  const trimmed = retryAfter.trim();
  if (!trimmed) {
    return undefined;
  }

  const seconds = Number(trimmed);
  if (!Number.isNaN(seconds)) {
    return Math.max(0, Math.round(seconds * 1000));
  }

  const dateMs = Date.parse(trimmed);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }

  return undefined;
}

function parseRetryAfterSeconds(retryAfter: string | undefined): number | undefined {
  const delayMs = parseRetryAfterMs(retryAfter);
  if (delayMs === undefined) {
    return undefined;
  }
  return Math.ceil(delayMs / 1000);
}

function coerceProblemStatus(status: unknown, fallbackStatus: number): number {
  const coerced = Number(status);
  return Number.isFinite(coerced) ? coerced : fallbackStatus;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isOptionalNullableString(value: unknown): value is string | null | undefined {
  return value === undefined || isNullableString(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isOptionalStringArrayOrNull(value: unknown): value is string[] | null | undefined {
  return value === undefined || value === null || isStringArray(value);
}

function isApiErrorPayload(value: unknown): value is ApiError {
  if (!isPlainObject(value)) {
    return false;
  }

  return (
    isNumber(value.code) &&
    isString(value.description) &&
    isOptionalStringArrayOrNull(value.details)
  );
}

function isApiErrorArray(value: unknown): value is ApiError[] {
  return Array.isArray(value) && value.every(isApiErrorPayload);
}

function hasRequiredProblemDetailsFields(payload: Record<string, unknown>): payload is Record<
  string,
  unknown
> & {
  detail: string;
  status: number;
  timestamp: string;
  title: string;
} {
  return (
    isString(payload.title) &&
    isNumber(payload.status) &&
    isString(payload.detail) &&
    isString(payload.timestamp)
  );
}

function isProblemDetailsPayload(
  payload: Record<string, unknown>,
): payload is Record<string, unknown> & { detail: string; title: string } {
  return isString(payload.title) && isString(payload.detail);
}

function isBadRequestProblemDetailsPayload(
  payload: Record<string, unknown>,
): payload is BadRequestProblemDetails {
  return (
    hasRequiredProblemDetailsFields(payload) &&
    isString(payload.instance) &&
    isString(payload.traceId) &&
    isApiErrorArray(payload.errors)
  );
}

function isUnauthorizedProblemDetailsPayload(
  payload: Record<string, unknown>,
): payload is UnauthorizedProblemDetails {
  return (
    hasRequiredProblemDetailsFields(payload) &&
    isOptionalNullableString(payload.instance) &&
    isOptionalNullableString(payload.traceId)
  );
}

function isForbiddenProblemDetailsPayload(
  payload: Record<string, unknown>,
): payload is ForbiddenProblemDetails {
  return (
    hasRequiredProblemDetailsFields(payload) &&
    isString(payload.reasonCode) &&
    isOptionalNullableString(payload.instance) &&
    isOptionalNullableString(payload.traceId) &&
    (payload.security === undefined || payload.security === null || isPlainObject(payload.security))
  );
}

function isGoneProblemDetailsPayload(
  payload: Record<string, unknown>,
): payload is GoneProblemDetails {
  return (
    hasRequiredProblemDetailsFields(payload) &&
    isString(payload.instance) &&
    isString(payload.traceId)
  );
}

function isTooManyRequestsProblemDetailsPayload(
  payload: Record<string, unknown>,
): payload is TooManyRequestsProblemDetails {
  return (
    hasRequiredProblemDetailsFields(payload) &&
    isString(payload.instance) &&
    isString(payload.traceId)
  );
}

function createUnknownApiProblem(
  statusCode: number,
  payload: Record<string, unknown>,
): UnknownApiProblem {
  const detail = typeof payload.detail === "string" ? payload.detail : undefined;
  return {
    raw: payload,
    status: coerceProblemStatus(payload.status, statusCode),
    title: typeof payload.title === "string" ? payload.title : "API error",
    ...(detail !== undefined ? { detail } : {}),
  };
}

function parseApiProblem(statusCode: number, payload: unknown): KsefApiProblem | undefined {
  if (!isPlainObject(payload)) {
    return undefined;
  }

  if ("exception" in payload) {
    return payload as ExceptionResponse;
  }

  if (statusCode === 429 && isPlainObject(payload.status)) {
    return payload as TooManyRequestsResponse;
  }

  if (isProblemDetailsPayload(payload)) {
    if (statusCode === 400 && isBadRequestProblemDetailsPayload(payload)) {
      return payload;
    }
    if (statusCode === 401 && isUnauthorizedProblemDetailsPayload(payload)) {
      return payload;
    }
    if (statusCode === 403 && isForbiddenProblemDetailsPayload(payload)) {
      return payload;
    }
    if (statusCode === 410 && isGoneProblemDetailsPayload(payload)) {
      return payload;
    }
    if (statusCode === 429 && isTooManyRequestsProblemDetailsPayload(payload)) {
      return payload;
    }
    return createUnknownApiProblem(statusCode, payload);
  }

  return Object.keys(payload).length > 0 ? createUnknownApiProblem(statusCode, payload) : undefined;
}

export class HttpClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly defaultHeaders: Record<string, string>;
  private readonly proxy: string | undefined;
  private readonly noProxy: string | undefined;
  private readonly retryOn429: boolean;
  private readonly retryOn5xx: boolean;
  private readonly retryOnTimeout: boolean;
  private readonly maxRetryAttempts: number;
  private readonly maxRetryDelayMs: number;
  private readonly strictPresignedUrlValidation: boolean;
  private readonly allowedPresignedHosts: string[] | undefined;
  private readonly allowPrivateNetworkPresignedUrls: boolean;
  private readonly systemWarningHandler: ((warning: string) => void) | undefined;

  constructor(options: HttpClientOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl, options.appendV2 ?? true);
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.defaultHeaders = options.defaultHeaders ?? {};
    this.proxy = options.proxy ?? process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;
    this.noProxy = options.noProxy ?? process.env.NO_PROXY;
    this.retryOn429 = options.retryOn429 ?? true;
    this.retryOn5xx = options.retryOn5xx ?? true;
    this.retryOnTimeout = options.retryOnTimeout ?? true;
    this.maxRetryAttempts = options.maxRetryAttempts ?? 3;
    this.maxRetryDelayMs = options.maxRetryDelayMs ?? 10_000;
    this.strictPresignedUrlValidation = options.strictPresignedUrlValidation ?? true;
    this.allowedPresignedHosts = options.allowedPresignedHosts;
    this.allowPrivateNetworkPresignedUrls = options.allowPrivateNetworkPresignedUrls ?? false;
    this.systemWarningHandler = options.systemWarningHandler;
  }

  async request<T>(options: HttpRequestOptions): Promise<T> {
    const url = this.buildUrl(options.path, options.query);
    this.validateSkipAuthOptions(options, url);

    const headers = new Headers(this.defaultHeaders);
    if (options.authToken) {
      headers.set("Authorization", `Bearer ${options.authToken}`);
    }
    if (options.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        headers.set(key, value);
      }
    }

    let body: BodyInit | undefined;
    if (options.body !== undefined) {
      if (typeof options.body === "string" || Buffer.isBuffer(options.body)) {
        body = options.body;
      } else if (options.body instanceof Uint8Array) {
        body = Buffer.from(options.body);
      } else {
        body = JSON.stringify(options.body);
        if (!headers.has("Content-Type")) {
          headers.set("Content-Type", "application/json");
        }
      }
    }

    const dispatcher = this.getDispatcher(url);

    const retryPolicy = this.resolveRetryPolicy(options.retry);
    const maxAttempts = Math.max(1, options.retry?.maxAttempts ?? this.maxRetryAttempts);
    const canRetryMethod = isIdempotentMethod(options.method);

    let lastError: unknown = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const init: RequestInit = {
          method: options.method,
          headers,
          signal: controller.signal,
        };
        if (dispatcher) {
          init.dispatcher = dispatcher as Dispatcher;
        }
        if (body !== undefined) {
          init.body = body;
        }
        const response = await fetch(url, init);
        if (
          shouldRetryResponse(response.status, retryPolicy) &&
          canRetryMethod &&
          attempt < maxAttempts
        ) {
          await response.arrayBuffer().catch(() => undefined);
          const retryAfter = response.headers.get("retry-after") ?? undefined;
          const delayMs = computeRetryDelayMs(retryAfter, attempt, this.maxRetryDelayMs);
          clearTimeout(timeout);
          await sleep(delayMs);
          continue;
        }
        clearTimeout(timeout);
        return await this.handleResponse<T>(response, options.responseType);
      } catch (error) {
        lastError = error;
        if (shouldRetryTimeout(error, retryPolicy) && canRetryMethod && attempt < maxAttempts) {
          const delayMs = computeRetryDelayMs(undefined, attempt, this.maxRetryDelayMs);
          clearTimeout(timeout);
          await sleep(delayMs);
          continue;
        }
        clearTimeout(timeout);
        break;
      }
    }

    if (lastError) {
      throw lastError;
    }
    throw new KsefHttpError(500, "HTTP request retry loop exited unexpectedly.", undefined);
  }

  private resolveRetryPolicy(retryOptions?: RetryOptions): RetryPolicy {
    return {
      retryOn429: retryOptions?.retryOn429 ?? this.retryOn429,
      retryOn5xx: retryOptions?.retryOn5xx ?? this.retryOn5xx,
      retryOnTimeout: retryOptions?.retryOnTimeout ?? this.retryOnTimeout,
    };
  }

  private validateSkipAuthOptions(options: HttpRequestOptions, url: string): void {
    if (!options.skipAuth) {
      return;
    }
    if (options.authToken) {
      throw new KsefValidationError("skipAuth and authToken cannot be used together.");
    }
    if (!/^https?:\/\//i.test(url)) {
      return;
    }
    validatePresignedUrlSecurity(
      {
        strictPresignedUrlValidation: this.strictPresignedUrlValidation,
        allowPrivateNetworkPresignedUrls: this.allowPrivateNetworkPresignedUrls,
        ...(this.allowedPresignedHosts
          ? { allowedPresignedHosts: this.allowedPresignedHosts }
          : {}),
      },
      url,
    );
  }

  private buildUrl(path: string, query?: HttpRequestOptions["query"]): string {
    const isAbsolute = /^https?:\/\//i.test(path);
    const base = isAbsolute ? path : `${this.baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
    const url = new URL(base);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) {
          continue;
        }
        if (Array.isArray(value)) {
          for (const item of value) {
            url.searchParams.append(key, String(item));
          }
          continue;
        }
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private getDispatcher(url: string): ProxyAgent | undefined {
    if (!this.proxy) {
      return undefined;
    }
    const hostname = new URL(url).hostname;
    if (shouldBypassProxy(hostname, this.noProxy)) {
      return undefined;
    }
    return new ProxyAgent(this.proxy);
  }

  private async handleResponse<T>(
    response: Response,
    responseType?: "json" | "text" | "buffer",
  ): Promise<T> {
    this.notifySystemWarning(response);
    const contentType = response.headers.get("content-type") ?? "";

    if (!response.ok) {
      await this.throwForError(response, contentType);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    if (responseType === "buffer") {
      const buffer = Buffer.from(await response.arrayBuffer());
      return buffer as T;
    }

    if (responseType === "text" || contentType.includes("application/xml")) {
      const text = await response.text();
      return text as T;
    }

    if (isJsonContentType(contentType)) {
      return (await response.json()) as T;
    }

    const fallback = await response.text();
    return fallback as T;
  }

  private async throwForError(response: Response, contentType: string): Promise<never> {
    const status = response.status;
    const retryAfter = response.headers.get("retry-after") ?? undefined;

    if (isJsonContentType(contentType)) {
      const payload = await response.json().catch(() => undefined);
      const problem = parseApiProblem(status, payload);
      if (status === 429) {
        throw new KsefRateLimitError(
          status,
          "Rate limit exceeded",
          payload,
          retryAfter,
          parseRetryAfterSeconds(retryAfter),
          problem,
        );
      }
      if (status === 460) {
        const statusDetails = extractStatusDetails(payload);
        if (statusDetails && isSuspendedCertificateStatus(statusDetails)) {
          const detailsSuffix = statusDetails.length ? ` Details: ${statusDetails.join(", ")}` : "";
          throw new KsefAuthStatusError(
            status,
            `Authentication failed with ${status}: certificate is suspended.${detailsSuffix}`,
            payload,
            statusDetails,
            problem,
          );
        }
      }
      throw new KsefApiError(status, `API request failed with ${status}`, payload, problem);
    }

    const text = await response.text().catch(() => undefined);
    if (status === 429) {
      throw new KsefRateLimitError(
        status,
        "Rate limit exceeded",
        text,
        retryAfter,
        parseRetryAfterSeconds(retryAfter),
      );
    }
    throw new KsefHttpError(status, `HTTP request failed with ${status}`, text);
  }

  private notifySystemWarning(response: Response): void {
    const warning = response.headers.get("x-system-warning");
    if (!warning || !this.systemWarningHandler) {
      return;
    }
    this.systemWarningHandler(warning);
  }
}

interface RetryPolicy {
  retryOn429: boolean;
  retryOn5xx: boolean;
  retryOnTimeout: boolean;
}

function isIdempotentMethod(method: HttpMethod): boolean {
  return method === "GET" || method === "PUT" || method === "DELETE";
}

function shouldRetryResponse(statusCode: number, retryPolicy: RetryPolicy): boolean {
  return (
    (retryPolicy.retryOn429 && statusCode === 429) ||
    (retryPolicy.retryOn5xx && statusCode >= 500 && statusCode <= 599)
  );
}

function shouldRetryTimeout(error: unknown, retryPolicy: RetryPolicy): boolean {
  return retryPolicy.retryOnTimeout && isTimeoutError(error);
}

function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  if (error.name === "AbortError" || error.name === "TimeoutError") {
    return true;
  }
  if (hasTimeoutCode(error)) {
    return true;
  }
  const cause = (error as { cause?: unknown }).cause;
  return cause instanceof Error && hasTimeoutCode(cause);
}

function hasTimeoutCode(error: Error): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return (
    code === "ETIMEDOUT" ||
    code === "ESOCKETTIMEDOUT" ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    code === "UND_ERR_HEADERS_TIMEOUT" ||
    code === "UND_ERR_BODY_TIMEOUT"
  );
}

function extractStatusDetails(payload: unknown): string[] | undefined {
  if (!isPlainObject(payload)) {
    return undefined;
  }
  const status = payload.status;
  if (!isPlainObject(status)) {
    return undefined;
  }
  const details = status.details;
  if (typeof details === "string") {
    return [details];
  }
  if (!Array.isArray(details)) {
    return undefined;
  }
  const mapped = details.filter((item): item is string => typeof item === "string");
  return mapped.length > 0 ? mapped : undefined;
}

function isSuspendedCertificateStatus(details: string[]): boolean {
  return details.some((detail) => {
    const normalized = normalizeForMatch(detail);
    const hasCertificate = normalized.includes("certyfikat") || normalized.includes("certificate");
    const hasSuspended = normalized.includes("zawiesz") || normalized.includes("suspend");
    return hasCertificate && hasSuspended;
  });
}

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function computeRetryDelayMs(
  retryAfter: string | undefined,
  attempt: number,
  maxDelayMs: number,
): number {
  const clamp = (value: number) => Math.max(0, Math.min(maxDelayMs, value));

  const retryAfterMs = parseRetryAfterMs(retryAfter);
  if (retryAfterMs !== undefined) {
    return clamp(retryAfterMs);
  }

  const base = Math.min(maxDelayMs, 500 * 2 ** Math.max(0, attempt - 1));
  const jitter = Math.random() * 250;
  return clamp(base + jitter);
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}
