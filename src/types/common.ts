export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type KsefEnvironment = "TEST" | "DEMO" | "PRD";

export const KSEF_ENV_URLS: Record<KsefEnvironment, string> = {
  TEST: "https://api-test.ksef.mf.gov.pl/v2",
  DEMO: "https://api-demo.ksef.mf.gov.pl/v2",
  PRD: "https://api.ksef.mf.gov.pl/v2",
};

export const KSEF_QR_URLS: Record<KsefEnvironment, string> = {
  TEST: "https://qr-test.ksef.mf.gov.pl",
  DEMO: "https://qr-demo.ksef.mf.gov.pl",
  PRD: "https://qr.ksef.mf.gov.pl",
};

export type ContextIdentifierType = "Nip" | "InternalId" | "NipVatUe" | "PeppolId";

export interface ContextIdentifier {
  type: ContextIdentifierType;
  value: string;
}

export interface StatusInfo {
  code: number;
  description: string;
  details?: string[];
}

export interface TokenInfo {
  token: string;
  validUntil: string;
}

export interface AuthenticationTokensResponse {
  accessToken: TokenInfo;
  refreshToken: TokenInfo;
}

export interface AuthenticationInitResponse {
  referenceNumber: string;
  authenticationToken: TokenInfo;
}

export interface AuthenticationMethodInfo {
  category: string;
  code: string;
  displayName: string;
}

export interface AuthenticationOperationStatusResponse {
  startDate: string;
  authenticationMethodInfo: AuthenticationMethodInfo;
  /**
   * @deprecated Use `authenticationMethodInfo` instead.
   */
  authenticationMethod: string;
  status: StatusInfo;
}

export interface EncryptionInfo {
  encryptedSymmetricKey: string;
  initializationVector: string;
}

export interface FileMetadata {
  hashSha256Base64: string;
  fileSize: number;
}

export interface FormCode {
  systemCode: string;
  schemaVersion: string;
  value: string;
}

export interface AuthorizationPolicy {
  allowedIps?: {
    ip4Addresses?: string[];
    ip4Masks?: string[];
    ip4Ranges?: string[];
  };
}
