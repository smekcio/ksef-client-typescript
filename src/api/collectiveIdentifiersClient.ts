import { BaseClient } from "../client/baseClient";
import {
  CollectiveIdentifierInvoice,
  CollectiveIdentifierInvoicesQueryRequest,
  CollectiveIdentifierInvoicesQueryResponse,
  CollectiveIdentifierInvoicesQueryResponseItem,
  CollectiveIdentifiersByKsefNumberQueryResponse,
  CollectiveIdentifiersByKsefNumberQueryResponseItem,
  CollectiveIdentifiersGenerateForNumbersOptions,
  CollectiveIdentifiersIterateOptions,
  CollectiveIdentifiersPagingOptions,
  CollectiveIdentifiersQueryByCreatedRangeOptions,
  CollectiveIdentifiersQueryRequest,
  CollectiveIdentifiersQueryResponse,
  CollectiveIdentifiersQueryResponseItem,
  GenerateCollectiveIdentifierRequest,
  GenerateCollectiveIdentifierResponse,
} from "../types/collectiveIdentifiers";
import {
  expandQueryDateBound,
  makeCollectiveIdentifierInvoice,
  PAGE_SIZE_INVOICES_MAX,
  PAGE_SIZE_MAX,
  requireCollectiveIdentifierNumber,
  requireGenerateInvoices,
  requireInvoicesQueryIdentifiers,
  requirePageSize,
  requireQueryDateRange,
} from "../utils/collectiveIdentifier";
import { requireKsefNumber } from "../utils/ksefNumber";

function buildPaging(
  options: CollectiveIdentifiersPagingOptions,
  pageSizeMax: number,
): {
  headers?: Record<string, string>;
  query?: { pageSize: number };
} {
  const pageSize =
    options.pageSize !== undefined ? requirePageSize(options.pageSize, pageSizeMax) : undefined;
  const headers =
    options.continuationToken !== undefined
      ? { "x-continuation-token": options.continuationToken }
      : undefined;
  const query = pageSize !== undefined ? { pageSize } : undefined;
  return {
    ...(headers ? { headers } : {}),
    ...(query ? { query } : {}),
  };
}

function validateQueryRequest(
  request: CollectiveIdentifiersQueryRequest,
): CollectiveIdentifiersQueryRequest {
  requireQueryDateRange(request.dateCreatedFrom, request.dateCreatedTo);
  if (request.collectiveIdentifierNumber) {
    requireCollectiveIdentifierNumber(request.collectiveIdentifierNumber);
  }
  return request;
}

function buildQueryRequest(
  dateFrom: string,
  dateTo: string,
  options: CollectiveIdentifiersQueryByCreatedRangeOptions = {},
): CollectiveIdentifiersQueryRequest {
  const expandedFrom = expandQueryDateBound(dateFrom, false);
  const expandedTo = expandQueryDateBound(dateTo, true);
  const collectiveIdentifierNumber = options.collectiveIdentifierNumber
    ? requireCollectiveIdentifierNumber(options.collectiveIdentifierNumber)
    : undefined;
  requireQueryDateRange(expandedFrom, expandedTo);
  return {
    dateCreatedFrom: expandedFrom,
    dateCreatedTo: expandedTo,
    ...(collectiveIdentifierNumber ? { collectiveIdentifierNumber } : {}),
    ...(options.createdInCurrentContext !== undefined
      ? { createdInCurrentContext: options.createdInCurrentContext }
      : {}),
    ...(options.invoiceCountFrom !== undefined
      ? { invoiceCountFrom: options.invoiceCountFrom }
      : {}),
    ...(options.invoiceCountTo !== undefined ? { invoiceCountTo: options.invoiceCountTo } : {}),
  };
}

function buildGenerateRequest(
  ksefNumbers: readonly string[],
  descriptions?: Array<string | null | undefined>,
): GenerateCollectiveIdentifierRequest {
  const numbers = [...ksefNumbers];
  if (descriptions !== undefined && descriptions.length !== numbers.length) {
    throw new Error("descriptions length must match ksef_numbers");
  }
  const invoices: CollectiveIdentifierInvoice[] = numbers.map((ksefNumber, index) => {
    const description = descriptions === undefined ? undefined : descriptions[index];
    return makeCollectiveIdentifierInvoice(ksefNumber, {
      ...(description !== undefined ? { description } : {}),
    });
  });
  return { invoices: requireGenerateInvoices(invoices) };
}

function toPagingOptions(
  pageSize: number | undefined,
  continuationToken: string | undefined,
): CollectiveIdentifiersPagingOptions {
  return {
    ...(pageSize !== undefined ? { pageSize } : {}),
    ...(continuationToken !== undefined ? { continuationToken } : {}),
  };
}

function toIteratePage<TItem>(
  items: TItem[] | undefined,
  continuationToken: string | null | undefined,
): { items: TItem[]; continuationToken?: string | null } {
  return {
    items: items ?? [],
    ...(continuationToken !== undefined ? { continuationToken } : {}),
  };
}

async function* iteratePages<TItem>(
  fetchPage: (
    continuationToken: string | undefined,
  ) => Promise<{ items: TItem[]; continuationToken?: string | null }>,
): AsyncGenerator<TItem> {
  let continuationToken: string | undefined;
  const seenTokens = new Set<string>();
  while (true) {
    const response = await fetchPage(continuationToken);
    for (const item of response.items) {
      yield item;
    }
    const nextToken = response.continuationToken ?? undefined;
    if (!nextToken || seenTokens.has(nextToken)) {
      return;
    }
    seenTokens.add(nextToken);
    continuationToken = nextToken;
  }
}

export class CollectiveIdentifiersClient extends BaseClient {
  async generate(
    request: GenerateCollectiveIdentifierRequest,
  ): Promise<GenerateCollectiveIdentifierResponse> {
    requireGenerateInvoices(request.invoices);
    const token = await this.getAccessToken();
    return this.http.request<GenerateCollectiveIdentifierResponse>({
      method: "POST",
      path: "/collective-identifiers",
      body: request,
      authToken: token,
    });
  }

  async generateForKsefNumbers(
    ksefNumbers: readonly string[],
    options: CollectiveIdentifiersGenerateForNumbersOptions = {},
  ): Promise<GenerateCollectiveIdentifierResponse> {
    return this.generate(buildGenerateRequest(ksefNumbers, options.descriptions));
  }

  async query(
    request: CollectiveIdentifiersQueryRequest,
    options: CollectiveIdentifiersPagingOptions = {},
  ): Promise<CollectiveIdentifiersQueryResponse> {
    validateQueryRequest(request);
    const token = await this.getAccessToken();
    const paging = buildPaging(options, PAGE_SIZE_MAX);
    return this.http.request<CollectiveIdentifiersQueryResponse>({
      method: "POST",
      path: "/collective-identifiers/query",
      body: request,
      ...paging,
      authToken: token,
    });
  }

  async queryByCreatedRange(
    dateFrom: string,
    dateTo: string,
    options: CollectiveIdentifiersQueryByCreatedRangeOptions = {},
  ): Promise<CollectiveIdentifiersQueryResponse> {
    return this.query(
      buildQueryRequest(dateFrom, dateTo, options),
      toPagingOptions(options.pageSize, options.continuationToken),
    );
  }

  async *iterQuery(
    request: CollectiveIdentifiersQueryRequest,
    options: CollectiveIdentifiersIterateOptions = {},
  ): AsyncGenerator<CollectiveIdentifiersQueryResponseItem> {
    yield* iteratePages(async (continuationToken) => {
      const response = await this.query(
        request,
        toPagingOptions(options.pageSize, continuationToken),
      );
      return toIteratePage(response.collectiveIdentifiers, response.continuationToken);
    });
  }

  async listInvoices(
    collectiveIdentifierNumbers: string | readonly string[],
    options: CollectiveIdentifiersPagingOptions = {},
  ): Promise<CollectiveIdentifierInvoicesQueryResponse> {
    const numbers = requireInvoicesQueryIdentifiers(collectiveIdentifierNumbers);
    const token = await this.getAccessToken();
    const paging = buildPaging(options, PAGE_SIZE_INVOICES_MAX);
    const body: CollectiveIdentifierInvoicesQueryRequest = {
      collectiveIdentifierNumbers: numbers,
    };
    return this.http.request<CollectiveIdentifierInvoicesQueryResponse>({
      method: "POST",
      path: "/collective-identifiers/invoices",
      body,
      ...paging,
      authToken: token,
    });
  }

  async *iterInvoices(
    collectiveIdentifierNumbers: string | readonly string[],
    options: CollectiveIdentifiersIterateOptions = {},
  ): AsyncGenerator<CollectiveIdentifierInvoicesQueryResponseItem> {
    yield* iteratePages(async (continuationToken) => {
      const response = await this.listInvoices(
        collectiveIdentifierNumbers,
        toPagingOptions(options.pageSize, continuationToken),
      );
      return toIteratePage(response.invoices, response.continuationToken);
    });
  }

  async listByKsefNumber(
    ksefNumber: string,
    options: CollectiveIdentifiersPagingOptions = {},
  ): Promise<CollectiveIdentifiersByKsefNumberQueryResponse> {
    const validated = requireKsefNumber(ksefNumber);
    const token = await this.getAccessToken();
    const paging = buildPaging(options, PAGE_SIZE_MAX);
    return this.http.request<CollectiveIdentifiersByKsefNumberQueryResponse>({
      method: "GET",
      path: `/collective-identifiers/ksef/${encodeURIComponent(validated)}`,
      ...paging,
      authToken: token,
    });
  }

  async *iterByKsefNumber(
    ksefNumber: string,
    options: CollectiveIdentifiersIterateOptions = {},
  ): AsyncGenerator<CollectiveIdentifiersByKsefNumberQueryResponseItem> {
    yield* iteratePages(async (continuationToken) => {
      const response = await this.listByKsefNumber(
        ksefNumber,
        toPagingOptions(options.pageSize, continuationToken),
      );
      return toIteratePage(response.collectiveIdentifiers, response.continuationToken);
    });
  }
}
