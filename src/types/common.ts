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
export type KsefLighthouseEnvironment = "TEST" | "PROD" | "PRD";

export const KSEF_ENV_URLS: Record<KsefEnvironment, string> = {
  TEST: "https://api-test.ksef.mf.gov.pl/v2",
  DEMO: "https://api-demo.ksef.mf.gov.pl/v2",
  PRD: "https://api.ksef.mf.gov.pl/v2",
};

export const KSEF_LIGHTHOUSE_URLS: Record<KsefLighthouseEnvironment, string> = {
  TEST: "https://api-latarnia-test.ksef.mf.gov.pl",
  PROD: "https://api-latarnia.ksef.mf.gov.pl",
  PRD: "https://api-latarnia.ksef.mf.gov.pl",
};

export const KSEF_LIGHTHOUSE_ENV_BY_KSEF_ENV: Record<KsefEnvironment, KsefLighthouseEnvironment> =
  {
    TEST: "TEST",
    DEMO: "TEST",
    PRD: "PRD",
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

export type AuthenticationMethodCategory = "XadesSignature" | "NationalNode" | "Token" | "Other";

export type AuthenticationMethod =
  | "Token"
  | "TrustedProfile"
  | "InternalCertificate"
  | "QualifiedSignature"
  | "QualifiedSeal"
  | "PersonalSignature"
  | "PeppolSignature";

export interface AuthenticationMethodInfo {
  category: AuthenticationMethodCategory;
  code: string;
  displayName: string;
}

export interface AuthenticationListItem {
  startDate: string;
  /**
   * @deprecated Use `authenticationMethodInfo` instead.
   */
  authenticationMethod: AuthenticationMethod;
  authenticationMethodInfo: AuthenticationMethodInfo;
  status: StatusInfo;
  isTokenRedeemed?: boolean;
  lastTokenRefreshDate?: string | null;
  refreshTokenValidUntil?: string | null;
  referenceNumber: string;
  isCurrent?: boolean;
}

export interface AuthenticationListResponse {
  continuationToken?: string;
  items: AuthenticationListItem[];
}

export interface AuthenticationOperationStatusResponse {
  startDate: string;
  authenticationMethodInfo: AuthenticationMethodInfo;
  /**
   * @deprecated Use `authenticationMethodInfo` instead.
   */
  authenticationMethod: AuthenticationMethod;
  status: StatusInfo;
  isTokenRedeemed?: boolean;
  lastTokenRefreshDate?: string | null;
  refreshTokenValidUntil?: string | null;
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

export interface Fa2FormCode extends FormCode {
  systemCode: "FA (2)";
  schemaVersion: "1-0E";
  value: "FA";
}

export interface Fa3FormCode extends FormCode {
  systemCode: "FA (3)";
  schemaVersion: "1-0E";
  value: "FA";
}

export interface Pef3FormCode extends FormCode {
  systemCode: "PEF (3)";
  schemaVersion: "2-1";
  value: "PEF";
}

export interface PefKor3FormCode extends FormCode {
  systemCode: "PEF_KOR (3)";
  schemaVersion: "2-1";
  value: "PEF";
}

export interface FaRr1FormCode extends FormCode {
  systemCode: "FA_RR (1)";
  schemaVersion: "1-0E";
  value: "RR";
}

export type OnlineSessionFormCode =
  | Fa2FormCode
  | Fa3FormCode
  | Pef3FormCode
  | PefKor3FormCode
  | FaRr1FormCode;

export type BatchSessionFormCode = Fa2FormCode | Fa3FormCode | FaRr1FormCode;

export interface AuthorizationPolicy {
  allowedIps?: {
    ip4Addresses?: string[];
    ip4Masks?: string[];
    ip4Ranges?: string[];
  };
}
