export type TokenPermissionType =
  | "CollectiveIdentifierManage"
  | "InvoiceRead"
  | "InvoiceWrite"
  | "CredentialsRead"
  | "CredentialsManage"
  | "SubunitManage"
  | "EnforcementOperations"
  | "Introspection";

export type KsefTokenStatus = "Pending" | "Active" | "Revoking" | "Revoked" | "Failed";
export type KsefTokenAuthorIdentifierType = "Nip" | "Pesel" | "Fingerprint";
export type KsefTokenContextIdentifierType = "Nip" | "InternalId" | "NipVatUe" | "PeppolId";

export interface TokenAuthorIdentifier {
  type: KsefTokenAuthorIdentifierType;
  value: string;
}

export interface TokenContextIdentifier {
  type: KsefTokenContextIdentifierType;
  value: string;
}

export interface GenerateTokenRequest {
  description: string;
  permissions: TokenPermissionType[];
}

export interface GenerateTokenResponse {
  referenceNumber: string;
  token: string;
}

export interface TokenStatusResponse {
  referenceNumber: string;
  authorIdentifier: TokenAuthorIdentifier;
  contextIdentifier: TokenContextIdentifier;
  description: string;
  requestedPermissions: TokenPermissionType[];
  dateCreated: string;
  lastUseDate?: string | null;
  status: KsefTokenStatus;
  statusDetails?: string[] | null;
}

export interface QueryTokensResponseItem {
  referenceNumber: string;
  authorIdentifier: TokenAuthorIdentifier;
  contextIdentifier: TokenContextIdentifier;
  description: string;
  requestedPermissions: TokenPermissionType[];
  dateCreated: string;
  lastUseDate?: string | null;
  status: KsefTokenStatus;
  statusDetails?: string[] | null;
}

export interface QueryTokensResponse {
  continuationToken?: string | null;
  tokens: QueryTokensResponseItem[];
}

// Backward-compatible aliases for existing SDK imports.
export type KsefTokenRequest = GenerateTokenRequest;
export type KsefTokenResponse = GenerateTokenResponse | TokenStatusResponse;
export type KsefTokensListResponse = QueryTokensResponse;

export interface KsefTokensListQueryParams {
  status?: KsefTokenStatus[];
  description?: string;
  authorIdentifier?: string;
  authorIdentifierType?: KsefTokenAuthorIdentifierType;
  pageSize?: number;
}
