import { BaseClient } from "../client/baseClient";
import { PeppolProvidersResponse } from "../types/peppol";

export class PeppolClient extends BaseClient {
  async queryProviders(): Promise<PeppolProvidersResponse> {
    const token = await this.getAccessToken();
    return this.http.request<PeppolProvidersResponse>({
      method: "GET",
      path: "/peppol/query",
      authToken: token,
    });
  }
}
