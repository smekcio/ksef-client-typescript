import {
  CollectiveIdentifierInvoice,
  CollectiveIdentifierInvoicesQueryResponse,
  CollectiveIdentifiersByKsefNumberQueryResponse,
  CollectiveIdentifiersQueryRequest,
  CollectiveIdentifiersQueryResponse,
  GenerateCollectiveIdentifierRequest,
  GenerateCollectiveIdentifierResponse,
} from "../types/openapi.generated";

export type {
  CollectiveIdentifierInvoice,
  CollectiveIdentifierInvoicesQueryResponse,
  CollectiveIdentifiersByKsefNumberQueryResponse,
  CollectiveIdentifiersQueryRequest,
  CollectiveIdentifiersQueryResponse,
  GenerateCollectiveIdentifierRequest,
  GenerateCollectiveIdentifierResponse,
};

export interface CollectiveIdentifiersPagingOptions {
  pageSize?: number;
  continuationToken?: string;
}
