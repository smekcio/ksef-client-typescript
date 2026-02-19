import { BaseClient } from "../client/baseClient";
import {
  InvoiceExportInitResponse,
  InvoiceExportRequest,
  InvoiceExportStatusResponse,
  InvoiceMetadataResponse,
  InvoiceQueryFilters,
  normalizeInvoiceQueryFilters,
  validateInvoiceQueryFilters,
} from "../types/invoices";

export class InvoicesClient extends BaseClient {
  async getInvoice(ksefNumber: string): Promise<string> {
    const token = await this.getAccessToken();
    return this.http.request<string>({
      method: "GET",
      path: `/invoices/ksef/${encodeURIComponent(ksefNumber)}`,
      authToken: token,
      responseType: "text",
      headers: {
        Accept: "application/xml",
      },
    });
  }

  async queryInvoiceMetadata(
    filters: InvoiceQueryFilters,
    pageOffset?: number,
    pageSize?: number,
    sortOrder?: "Asc" | "Desc",
  ): Promise<InvoiceMetadataResponse> {
    const normalizedFilters = normalizeInvoiceQueryFilters(filters);
    validateInvoiceQueryFilters(normalizedFilters);
    const token = await this.getAccessToken();
    return this.http.request<InvoiceMetadataResponse>({
      method: "POST",
      path: "/invoices/query/metadata",
      query: {
        pageOffset,
        pageSize,
        sortOrder,
      },
      body: normalizedFilters,
      authToken: token,
    });
  }

  async exportInvoices(request: InvoiceExportRequest): Promise<InvoiceExportInitResponse> {
    const { includeMetadata, ...body } = request;
    const normalizedFilters = normalizeInvoiceQueryFilters(body.filters);
    validateInvoiceQueryFilters(normalizedFilters);
    const token = await this.getAccessToken();
    return this.http.request<InvoiceExportInitResponse>({
      method: "POST",
      path: "/invoices/exports",
      ...(includeMetadata ? { headers: { "X-KSeF-Feature": "include-metadata" } } : {}),
      body: {
        ...body,
        filters: normalizedFilters,
      },
      authToken: token,
    });
  }

  async getInvoiceExportStatus(referenceNumber: string): Promise<InvoiceExportStatusResponse> {
    const token = await this.getAccessToken();
    return this.http.request<InvoiceExportStatusResponse>({
      method: "GET",
      path: `/invoices/exports/${encodeURIComponent(referenceNumber)}`,
      authToken: token,
    });
  }
}
