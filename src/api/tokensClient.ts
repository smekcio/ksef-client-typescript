import { BaseClient } from "../client/baseClient";
import {
  KsefTokenRequest,
  KsefTokenResponse,
  KsefTokensListQueryParams,
  KsefTokensListResponse,
} from "../types/tokens";

export class TokensClient extends BaseClient {
  async listTokens(
    params?: KsefTokensListQueryParams,
    continuationToken?: string,
  ): Promise<KsefTokensListResponse> {
    const token = await this.getAccessToken();
    const headers =
      continuationToken !== undefined ? { "x-continuation-token": continuationToken } : undefined;
    const query = params
      ? {
          status: params.status,
          description: params.description,
          authorIdentifier: params.authorIdentifier,
          authorIdentifierType: params.authorIdentifierType,
          pageSize: params.pageSize,
        }
      : undefined;
    return this.http.request<KsefTokensListResponse>({
      method: "GET",
      path: "/tokens",
      ...(headers ? { headers } : {}),
      ...(query ? { query } : {}),
      authToken: token,
    });
  }

  async generateToken(request: KsefTokenRequest): Promise<KsefTokenResponse> {
    const token = await this.getAccessToken();
    return this.http.request<KsefTokenResponse>({
      method: "POST",
      path: "/tokens",
      body: request,
      authToken: token,
    });
  }

  async getToken(referenceNumber: string): Promise<KsefTokenResponse> {
    const token = await this.getAccessToken();
    return this.http.request<KsefTokenResponse>({
      method: "GET",
      path: `/tokens/${encodeURIComponent(referenceNumber)}`,
      authToken: token,
    });
  }

  async revokeToken(referenceNumber: string): Promise<void> {
    const token = await this.getAccessToken();
    await this.http.request<void>({
      method: "DELETE",
      path: `/tokens/${encodeURIComponent(referenceNumber)}`,
      authToken: token,
    });
  }
}
