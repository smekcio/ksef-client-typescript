import { JsonObject } from "./common";

export type PermissionsGrantRequest = JsonObject;
export type PermissionsQueryRequest = JsonObject;
export type PermissionsOperationResponse = JsonObject;
export type PermissionsListResponse = JsonObject;

export interface PermissionsQueryPaging {
  pageOffset?: number | undefined;
  pageSize?: number | undefined;
}
