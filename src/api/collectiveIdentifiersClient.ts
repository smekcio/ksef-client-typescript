import { BaseClient } from "../client/baseClient";
import {
  CollectiveIdentifierInvoicesQueryResponse,
  CollectiveIdentifiersByKsefNumberQueryResponse,
  CollectiveIdentifiersPagingOptions,
  CollectiveIdentifiersQueryRequest,
  CollectiveIdentifiersQueryResponse,
  GenerateCollectiveIdentifierRequest,
  GenerateCollectiveIdentifierResponse,
} from "../types/collectiveIdentifiers";
import { requireCollectiveIdentifierNumber } from "../utils/collectiveIdentifier";
import { requireKsefNumber } from "../utils/ksefNumber";

export class CollectiveIdentifiersClient extends BaseClient {
  async generate(
    request: GenerateCollectiveIdentifierRequest,
  ): Promise<GenerateCollectiveIdentifierResponse> {
    const token = await this.getAccessToken();
    return this.http.request<GenerateCollectiveIdentifierResponse>({
      method: "POST",
      path: "/collective-identifiers",
      body: request,
      authToken: token,
    });
  }

  async query(
    request: CollectiveIdentifiersQueryRequest,
    options: CollectiveIdentifiersPagingOptions = {},
  ): Promise<CollectiveIdentifiersQueryResponse> {
    const token = await this.getAccessToken();
    const headers =
      options.continuationToken !== undefined
        ? { "x-continuation-token": options.continuationToken }
        : undefined;
    const query = options.pageSize !== undefined ? { pageSize: options.pageSize } : undefined;
    return this.http.request<CollectiveIdentifiersQueryResponse>({
      method: "POST",
      path: "/collective-identifiers/query",
      body: request,
      ...(headers ? { headers } : {}),
      ...(query ? { query } : {}),
      authToken: token,
    });
  }

  async listInvoices(
    collectiveIdentifierNumber: string,
    options: CollectiveIdentifiersPagingOptions = {},
  ): Promise<CollectiveIdentifierInvoicesQueryResponse> {
    const validated = requireCollectiveIdentifierNumber(collectiveIdentifierNumber);
    const token = await this.getAccessToken();
    const headers =
      options.continuationToken !== undefined
        ? { "x-continuation-token": options.continuationToken }
        : undefined;
    const query = options.pageSize !== undefined ? { pageSize: options.pageSize } : undefined;
    return this.http.request<CollectiveIdentifierInvoicesQueryResponse>({
      method: "GET",
      path: `/collective-identifiers/${encodeURIComponent(validated)}/invoices`,
      ...(headers ? { headers } : {}),
      ...(query ? { query } : {}),
      authToken: token,
    });
  }

  async listByKsefNumber(
    ksefNumber: string,
    options: CollectiveIdentifiersPagingOptions = {},
  ): Promise<CollectiveIdentifiersByKsefNumberQueryResponse> {
    const validated = requireKsefNumber(ksefNumber);
    const token = await this.getAccessToken();
    const headers =
      options.continuationToken !== undefined
        ? { "x-continuation-token": options.continuationToken }
        : undefined;
    const query = options.pageSize !== undefined ? { pageSize: options.pageSize } : undefined;
    return this.http.request<CollectiveIdentifiersByKsefNumberQueryResponse>({
      method: "GET",
      path: `/collective-identifiers/ksef/${encodeURIComponent(validated)}`,
      ...(headers ? { headers } : {}),
      ...(query ? { query } : {}),
      authToken: token,
    });
  }
}
