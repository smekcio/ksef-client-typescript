import { BaseClient } from "../client/baseClient";
import { AuthenticationListResponse } from "../types/common";
import { normalizeAuthenticationListResponse } from "../utils/authenticationMethodInfo";

export class ActiveSessionsClient extends BaseClient {
  async listActiveSessions(
    pageSize?: number,
    continuationToken?: string,
  ): Promise<AuthenticationListResponse> {
    const token = await this.getAccessToken();
    const headers =
      continuationToken !== undefined ? { "x-continuation-token": continuationToken } : undefined;
    const response = await this.http.request<AuthenticationListResponse>({
      method: "GET",
      path: "/auth/sessions",
      ...(headers ? { headers } : {}),
      query: {
        pageSize,
      },
      authToken: token,
    });
    return normalizeAuthenticationListResponse(response);
  }

  async revokeCurrentSession(): Promise<void> {
    const token = await this.getAccessToken();
    await this.http.request<void>({
      method: "DELETE",
      path: "/auth/sessions/current",
      authToken: token,
    });
  }

  async revokeSession(referenceNumber: string): Promise<void> {
    const token = await this.getAccessToken();
    await this.http.request<void>({
      method: "DELETE",
      path: `/auth/sessions/${encodeURIComponent(referenceNumber)}`,
      authToken: token,
    });
  }
}
