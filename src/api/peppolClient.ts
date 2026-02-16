import { BaseClient } from "../client/baseClient";
import { PeppolProvidersResponse } from "../types/peppol";

export class PeppolClient extends BaseClient {
  async queryProviders(pageOffset?: number, pageSize?: number): Promise<PeppolProvidersResponse> {
    const query =
      pageOffset !== undefined || pageSize !== undefined ? { pageOffset, pageSize } : undefined;
    return this.http.request<PeppolProvidersResponse>({
      method: "GET",
      path: "/peppol/query",
      ...(query ? { query } : {}),
    });
  }
}
