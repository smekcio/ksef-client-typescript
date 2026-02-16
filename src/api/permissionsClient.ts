import { BaseClient } from "../client/baseClient";
import {
  PermissionsGrantRequest,
  PermissionsListResponse,
  PermissionsOperationResponse,
  PermissionsQueryPaging,
  PermissionsQueryRequest,
} from "../types/permissions";

export class PermissionsClient extends BaseClient {
  async grantAuthorizations(
    request: PermissionsGrantRequest,
  ): Promise<PermissionsOperationResponse> {
    return this.postOperation("/permissions/authorizations/grants", request);
  }

  async grantEntities(request: PermissionsGrantRequest): Promise<PermissionsOperationResponse> {
    return this.postOperation("/permissions/entities/grants", request);
  }

  async grantEuEntitiesAdministration(
    request: PermissionsGrantRequest,
  ): Promise<PermissionsOperationResponse> {
    return this.postOperation("/permissions/eu-entities/administration/grants", request);
  }

  async grantEuEntities(request: PermissionsGrantRequest): Promise<PermissionsOperationResponse> {
    return this.postOperation("/permissions/eu-entities/grants", request);
  }

  async grantIndirect(request: PermissionsGrantRequest): Promise<PermissionsOperationResponse> {
    return this.postOperation("/permissions/indirect/grants", request);
  }

  async grantPersons(request: PermissionsGrantRequest): Promise<PermissionsOperationResponse> {
    return this.postOperation("/permissions/persons/grants", request);
  }

  async grantSubunits(request: PermissionsGrantRequest): Promise<PermissionsOperationResponse> {
    return this.postOperation("/permissions/subunits/grants", request);
  }

  async revokeAuthorizationGrant(permissionId: string): Promise<void> {
    return this.deleteOperation(
      `/permissions/authorizations/grants/${encodeURIComponent(permissionId)}`,
    );
  }

  async revokeCommonGrant(permissionId: string): Promise<void> {
    return this.deleteOperation(`/permissions/common/grants/${encodeURIComponent(permissionId)}`);
  }

  async queryAuthorizations(
    request: PermissionsQueryRequest,
    pageOffset?: number,
    pageSize?: number,
  ): Promise<PermissionsListResponse> {
    return this.postQuery("/permissions/query/authorizations/grants", request, {
      pageOffset,
      pageSize,
    });
  }

  async queryEntitiesRoles(pageOffset?: number, pageSize?: number): Promise<PermissionsListResponse> {
    return this.getQuery("/permissions/query/entities/roles", {
      pageOffset,
      pageSize,
    });
  }

  async queryEuEntitiesGrants(
    request: PermissionsQueryRequest,
    pageOffset?: number,
    pageSize?: number,
  ): Promise<PermissionsListResponse> {
    return this.postQuery("/permissions/query/eu-entities/grants", request, {
      pageOffset,
      pageSize,
    });
  }

  async queryPersonalGrants(
    request: PermissionsQueryRequest,
    pageOffset?: number,
    pageSize?: number,
  ): Promise<PermissionsListResponse> {
    return this.postQuery("/permissions/query/personal/grants", request, {
      pageOffset,
      pageSize,
    });
  }

  async queryPersonsGrants(
    request: PermissionsQueryRequest,
    pageOffset?: number,
    pageSize?: number,
  ): Promise<PermissionsListResponse> {
    return this.postQuery("/permissions/query/persons/grants", request, {
      pageOffset,
      pageSize,
    });
  }

  async querySubordinateEntitiesRoles(
    request: PermissionsQueryRequest,
    pageOffset?: number,
    pageSize?: number,
  ): Promise<PermissionsListResponse> {
    return this.postQuery("/permissions/query/subordinate-entities/roles", request, {
      pageOffset,
      pageSize,
    });
  }

  async querySubunitsGrants(
    request: PermissionsQueryRequest,
    pageOffset?: number,
    pageSize?: number,
  ): Promise<PermissionsListResponse> {
    return this.postQuery("/permissions/query/subunits/grants", request, {
      pageOffset,
      pageSize,
    });
  }

  async getAttachmentPermissionStatus(): Promise<PermissionsOperationResponse> {
    const token = await this.getAccessToken();
    return this.http.request<PermissionsOperationResponse>({
      method: "GET",
      path: "/permissions/attachments/status",
      authToken: token,
    });
  }

  async getOperationStatus(referenceNumber: string): Promise<PermissionsOperationResponse> {
    const token = await this.getAccessToken();
    return this.http.request<PermissionsOperationResponse>({
      method: "GET",
      path: `/permissions/operations/${encodeURIComponent(referenceNumber)}`,
      authToken: token,
    });
  }

  private async postOperation(
    path: string,
    body: PermissionsGrantRequest,
  ): Promise<PermissionsOperationResponse> {
    const token = await this.getAccessToken();
    return this.http.request<PermissionsOperationResponse>({
      method: "POST",
      path,
      body,
      authToken: token,
    });
  }

  private async deleteOperation(path: string): Promise<void> {
    const token = await this.getAccessToken();
    await this.http.request<void>({
      method: "DELETE",
      path,
      authToken: token,
    });
  }

  private async postQuery(
    path: string,
    body: PermissionsQueryRequest,
    paging?: PermissionsQueryPaging,
  ): Promise<PermissionsListResponse> {
    const token = await this.getAccessToken();
    const query =
      paging && (paging.pageOffset !== undefined || paging.pageSize !== undefined)
        ? {
            pageOffset: paging.pageOffset,
            pageSize: paging.pageSize,
          }
        : undefined;
    return this.http.request<PermissionsListResponse>({
      method: "POST",
      path,
      ...(query ? { query } : {}),
      body,
      authToken: token,
    });
  }

  private async getQuery(path: string, paging?: PermissionsQueryPaging): Promise<PermissionsListResponse> {
    const token = await this.getAccessToken();
    const query =
      paging && (paging.pageOffset !== undefined || paging.pageSize !== undefined)
        ? {
            pageOffset: paging.pageOffset,
            pageSize: paging.pageSize,
          }
        : undefined;
    return this.http.request<PermissionsListResponse>({
      method: "GET",
      path,
      ...(query ? { query } : {}),
      authToken: token,
    });
  }
}
