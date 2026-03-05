import { fetch, ProxyAgent, Headers } from "undici";
import type { BodyInit, Dispatcher, RequestInit, Response } from "undici";
import { HttpMethod, JsonObject } from "../types/common";
import { validatePresignedUrlSecurity } from "./presignedUrlPolicy";
import {
  KsefApiError,
  KsefAuthStatusError,
  KsefHttpError,
  KsefRateLimitError,
  KsefValidationError,
} from "../errors/errors";

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
        if (shouldRetryResponse(response.status, retryPolicy) && canRetryMethod && attempt < maxAttempts) {
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
        if (
          shouldRetryTimeout(error, retryPolicy) &&
          canRetryMethod &&
          attempt < maxAttempts
        ) {
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
        ...(this.allowedPresignedHosts ? { allowedPresignedHosts: this.allowedPresignedHosts } : {}),
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

    if (contentType.includes("application/json")) {
      return (await response.json()) as T;
    }

    const fallback = await response.text();
    return fallback as T;
  }

  private async throwForError(response: Response, contentType: string): Promise<never> {
    const status = response.status;
    const retryAfter = response.headers.get("retry-after") ?? undefined;

    if (contentType.includes("application/json")) {
      const payload = await response.json().catch(() => undefined);
      if (status === 429) {
        throw new KsefRateLimitError(status, "Rate limit exceeded", payload, retryAfter);
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
          );
        }
      }
      throw new KsefApiError(status, `API request failed with ${status}`, payload);
    }

    const text = await response.text().catch(() => undefined);
    if (status === 429) {
      throw new KsefRateLimitError(status, "Rate limit exceeded", text, retryAfter);
    }
    throw new KsefHttpError(status, `HTTP request failed with ${status}`, text);
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

  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (!Number.isNaN(seconds)) {
      return clamp(Math.round(seconds * 1000));
    }
    const dateMs = Date.parse(retryAfter);
    if (!Number.isNaN(dateMs)) {
      return clamp(dateMs - Date.now());
    }
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
