import { BaseClient } from "../client/baseClient";
import { JsonObject } from "../types/common";

export class ActiveSessionsClient extends BaseClient {
  async listActiveSessions(pageSize?: number, continuationToken?: string): Promise<JsonObject> {
    const token = await this.getAccessToken();
    const headers =
      continuationToken !== undefined ? { "x-continuation-token": continuationToken } : undefined;
    return this.http.request<JsonObject>({
      method: "GET",
      path: "/auth/sessions",
      ...(headers ? { headers } : {}),
      query: {
        pageSize,
      },
      authToken: token,
    });
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
