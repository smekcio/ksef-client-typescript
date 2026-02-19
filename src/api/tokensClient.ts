import { BaseClient } from "../client/baseClient";
import {
  GenerateTokenRequest,
  GenerateTokenResponse,
  KsefTokensListQueryParams,
  QueryTokensResponse,
  TokenStatusResponse,
} from "../types/tokens";

export class TokensClient extends BaseClient {
  async listTokens(
    params?: KsefTokensListQueryParams,
    continuationToken?: string,
  ): Promise<QueryTokensResponse> {
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
    return this.http.request<QueryTokensResponse>({
      method: "GET",
      path: "/tokens",
      ...(headers ? { headers } : {}),
      ...(query ? { query } : {}),
      authToken: token,
    });
  }

  async generateToken(request: GenerateTokenRequest): Promise<GenerateTokenResponse> {
    const token = await this.getAccessToken();
    return this.http.request<GenerateTokenResponse>({
      method: "POST",
      path: "/tokens",
      body: request,
      authToken: token,
    });
  }

  async getToken(referenceNumber: string): Promise<TokenStatusResponse> {
    const token = await this.getAccessToken();
    return this.http.request<TokenStatusResponse>({
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
