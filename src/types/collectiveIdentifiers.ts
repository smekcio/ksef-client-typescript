import {
  CollectiveIdentifierInvoice,
  CollectiveIdentifierInvoicesQueryRequest,
  CollectiveIdentifierInvoicesQueryResponse,
  CollectiveIdentifierInvoicesQueryResponseItem,
  CollectiveIdentifiersByKsefNumberQueryResponse,
  CollectiveIdentifiersByKsefNumberQueryResponseItem,
  CollectiveIdentifiersQueryRequest,
  CollectiveIdentifiersQueryResponse,
  CollectiveIdentifiersQueryResponseItem,
  GenerateCollectiveIdentifierRequest,
  GenerateCollectiveIdentifierResponse,
} from "../types/openapi.generated";

export type {
  CollectiveIdentifierInvoice,
  CollectiveIdentifierInvoicesQueryRequest,
  CollectiveIdentifierInvoicesQueryResponse,
  CollectiveIdentifierInvoicesQueryResponseItem,
  CollectiveIdentifiersByKsefNumberQueryResponse,
  CollectiveIdentifiersByKsefNumberQueryResponseItem,
  CollectiveIdentifiersQueryRequest,
  CollectiveIdentifiersQueryResponse,
  CollectiveIdentifiersQueryResponseItem,
  GenerateCollectiveIdentifierRequest,
  GenerateCollectiveIdentifierResponse,
};

export interface CollectiveIdentifiersPagingOptions {
  pageSize?: number;
  continuationToken?: string;
}

export interface CollectiveIdentifiersQueryByCreatedRangeOptions extends CollectiveIdentifiersPagingOptions {
  collectiveIdentifierNumber?: string;
  createdInCurrentContext?: boolean;
  invoiceCountFrom?: number;
  invoiceCountTo?: number;
}

export interface CollectiveIdentifiersGenerateForNumbersOptions {
  descriptions?: Array<string | null | undefined>;
}

export interface CollectiveIdentifiersIterateOptions {
  pageSize?: number;
}
