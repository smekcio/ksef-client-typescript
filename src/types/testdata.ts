import { JsonObject } from "./common";

export type TestdataRequest = JsonObject;
export type TestdataResponse = JsonObject;

export type TestDataAuthenticationContextIdentifierType =
  | "Nip"
  | "InternalId"
  | "NipVatUe"
  | "PeppolId";

export interface TestDataAuthenticationContextIdentifier {
  type: TestDataAuthenticationContextIdentifierType;
  value: string;
}

export interface TestDataContextBlockRequest {
  contextIdentifier?: TestDataAuthenticationContextIdentifier | null;
}

export type TestDataContextBlockResponse = JsonObject;

export interface TestDataContextUnblockRequest {
  contextIdentifier?: TestDataAuthenticationContextIdentifier | null;
}

export type TestDataContextUnblockResponse = JsonObject;

export interface TestDataUpdateCertificateRequest {
  validTo: string;
}
