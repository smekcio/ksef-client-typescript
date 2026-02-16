import { JsonObject } from "./common";

export type KsefTokenRequest = JsonObject;
export type KsefTokenResponse = JsonObject;
export type KsefTokensListResponse = JsonObject;

export type KsefTokenStatus = "Pending" | "Active" | "Revoking" | "Revoked" | "Failed";
export type KsefTokenAuthorIdentifierType = "Nip" | "Pesel" | "Fingerprint";

export interface KsefTokensListQueryParams {
  status?: KsefTokenStatus[];
  description?: string;
  authorIdentifier?: string;
  authorIdentifierType?: KsefTokenAuthorIdentifierType;
  pageSize?: number;
}
