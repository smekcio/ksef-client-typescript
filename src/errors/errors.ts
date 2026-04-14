import type {
  BadRequestProblemDetails,
  ExceptionResponse,
  ForbiddenProblemDetails,
  GoneProblemDetails,
  TooManyRequestsProblemDetails,
  TooManyRequestsResponse,
  UnauthorizedProblemDetails,
} from "../types/openapi.generated";

export interface UnknownApiProblem {
  detail?: string;
  raw: Record<string, unknown>;
  status: number;
  title: string;
}

export type KsefApiProblem =
  | BadRequestProblemDetails
  | ExceptionResponse
  | ForbiddenProblemDetails
  | GoneProblemDetails
  | TooManyRequestsProblemDetails
  | TooManyRequestsResponse
  | UnauthorizedProblemDetails
  | UnknownApiProblem;

export class KsefError extends Error {
  override name = "KsefError";

  constructor(message: string) {
    super(message);
  }
}

export class KsefHttpError extends KsefError {
  override name = "KsefHttpError";
  readonly problem: KsefApiProblem | undefined;
  readonly statusCode: number;
  readonly responseBody: string | undefined;

  constructor(
    statusCode: number,
    message: string,
    responseBody?: string,
    problem?: KsefApiProblem,
  ) {
    super(message);
    this.problem = problem;
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}

export class KsefApiError extends KsefError {
  override name = "KsefApiError";
  readonly problem: KsefApiProblem | undefined;
  readonly statusCode: number;
  readonly responseBody: unknown | undefined;

  constructor(
    statusCode: number,
    message: string,
    responseBody: unknown,
    problem?: KsefApiProblem,
  ) {
    super(message);
    this.problem = problem;
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}

export class KsefRateLimitError extends KsefApiError {
  override name = "KsefRateLimitError";
  readonly retryAfter: string | undefined;
  readonly retryAfterSeconds: number | undefined;

  constructor(
    statusCode: number,
    message: string,
    responseBody: unknown,
    retryAfter?: string,
    retryAfterSeconds?: number,
    problem?: KsefApiProblem,
  ) {
    super(statusCode, message, responseBody, problem);
    this.retryAfter = retryAfter;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class KsefAuthStatusError extends KsefApiError {
  override name = "KsefAuthStatusError";
  readonly statusDetails: string[] | undefined;

  constructor(
    statusCode: number,
    message: string,
    responseBody: unknown,
    statusDetails?: string[],
    problem?: KsefApiProblem,
  ) {
    super(statusCode, message, responseBody, problem);
    this.statusDetails = statusDetails;
  }
}

export class KsefSessionExpiredError extends KsefError {
  override name = "KsefSessionExpiredError";
}

export class KsefValidationError extends KsefError {
  override name = "KsefValidationError";
  readonly details: string[] | undefined;

  constructor(message: string, details?: string[]) {
    super(message);
    this.details = details;
  }
}
