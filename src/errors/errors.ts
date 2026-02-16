export class KsefError extends Error {
  override name = "KsefError";

  constructor(message: string) {
    super(message);
  }
}

export class KsefHttpError extends KsefError {
  override name = "KsefHttpError";
  readonly statusCode: number;
  readonly responseBody: string | undefined;

  constructor(statusCode: number, message: string, responseBody?: string) {
    super(message);
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}

export class KsefApiError extends KsefError {
  override name = "KsefApiError";
  readonly statusCode: number;
  readonly responseBody: unknown | undefined;

  constructor(statusCode: number, message: string, responseBody: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}

export class KsefRateLimitError extends KsefApiError {
  override name = "KsefRateLimitError";
  readonly retryAfter: string | undefined;

  constructor(statusCode: number, message: string, responseBody: unknown, retryAfter?: string) {
    super(statusCode, message, responseBody);
    this.retryAfter = retryAfter;
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
  ) {
    super(statusCode, message, responseBody);
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
