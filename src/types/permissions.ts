import { JsonObject } from "./common";

export type EntityPermissionsContextIdentifierType = "Nip" | "InternalId";

export interface EntityPermissionsContextIdentifier {
  type: EntityPermissionsContextIdentifierType;
  value: string;
}

export type EntityPermissionItemScope = "InvoiceWrite" | "InvoiceRead";

export interface EntityPermissionItem {
  id: string;
  contextIdentifier: EntityPermissionsContextIdentifier;
  permissionScope: EntityPermissionItemScope;
  description: string;
  startDate: string;
  canDelegate: boolean;
}

export interface EntityPermissionsQueryRequest {
  contextIdentifier?: EntityPermissionsContextIdentifier | null;
}

export interface QueryEntityPermissionsResponse {
  permissions: EntityPermissionItem[];
  hasMore: boolean;
}

export type PermissionsGrantRequest = JsonObject;
export type PermissionsQueryRequest = JsonObject;
export type PermissionsOperationResponse = JsonObject;
export type PermissionsListResponse = JsonObject;

export interface PermissionsQueryPaging {
  pageOffset?: number | undefined;
  pageSize?: number | undefined;
}
