import { BaseClient } from "../client/baseClient";
import {
  GetSessionsQueryParams,
  OpenBatchSessionRequest,
  OpenBatchSessionResponse,
  OpenOnlineSessionRequest,
  OpenOnlineSessionResponse,
  SendInvoiceRequest,
  SendInvoiceResponse,
  SessionFailedInvoicesResponse,
  SessionInvoiceStatusResponse,
  SessionInvoicesResponse,
  SessionStatusResponse,
  SessionsListResponse,
} from "../types/sessions";

export class SessionsClient extends BaseClient {
  async getSessions(
    query: GetSessionsQueryParams,
    continuationToken?: string,
  ): Promise<SessionsListResponse> {
    const token = await this.getAccessToken();
    const headers =
      continuationToken !== undefined ? { "x-continuation-token": continuationToken } : undefined;
    const queryParams = {
      sessionType: query.sessionType,
      referenceNumber: query.referenceNumber,
      dateCreatedFrom: query.dateCreatedFrom,
      dateCreatedTo: query.dateCreatedTo,
      dateClosedFrom: query.dateClosedFrom,
      dateClosedTo: query.dateClosedTo,
      dateModifiedFrom: query.dateModifiedFrom,
      dateModifiedTo: query.dateModifiedTo,
      statuses: query.statuses,
      pageSize: query.pageSize,
    };
    return this.http.request<SessionsListResponse>({
      method: "GET",
      path: "/sessions",
      ...(headers ? { headers } : {}),
      query: queryParams,
      authToken: token,
    });
  }

  async getSessionStatus(referenceNumber: string): Promise<SessionStatusResponse> {
    const token = await this.getAccessToken();
    return this.http.request<SessionStatusResponse>({
      method: "GET",
      path: `/sessions/${encodeURIComponent(referenceNumber)}`,
      authToken: token,
    });
  }

  async getSessionInvoices(
    referenceNumber: string,
    pageOffset?: number,
    pageSize?: number,
    continuationToken?: string,
  ): Promise<SessionInvoicesResponse> {
    const token = await this.getAccessToken();
    const headers =
      continuationToken !== undefined ? { "x-continuation-token": continuationToken } : undefined;
    return this.http.request<SessionInvoicesResponse>({
      method: "GET",
      path: `/sessions/${encodeURIComponent(referenceNumber)}/invoices`,
      ...(headers ? { headers } : {}),
      query: {
        pageOffset,
        pageSize,
      },
      authToken: token,
    });
  }

  async getSessionInvoiceStatus(
    referenceNumber: string,
    invoiceReferenceNumber: string,
  ): Promise<SessionInvoiceStatusResponse> {
    const token = await this.getAccessToken();
    return this.http.request<SessionInvoiceStatusResponse>({
      method: "GET",
      path: `/sessions/${encodeURIComponent(referenceNumber)}/invoices/${encodeURIComponent(
        invoiceReferenceNumber,
      )}`,
      authToken: token,
    });
  }

  async getSessionInvoiceUpoByReferenceNumber(
    referenceNumber: string,
    invoiceReferenceNumber: string,
  ): Promise<string> {
    const token = await this.getAccessToken();
    return this.http.request<string>({
      method: "GET",
      path: `/sessions/${encodeURIComponent(referenceNumber)}/invoices/${encodeURIComponent(
        invoiceReferenceNumber,
      )}/upo`,
      authToken: token,
      responseType: "text",
      headers: {
        Accept: "application/xml",
      },
    });
  }

  async getSessionInvoiceUpoByKsefNumber(
    referenceNumber: string,
    ksefNumber: string,
  ): Promise<string> {
    const token = await this.getAccessToken();
    return this.http.request<string>({
      method: "GET",
      path: `/sessions/${encodeURIComponent(referenceNumber)}/invoices/ksef/${encodeURIComponent(
        ksefNumber,
      )}/upo`,
      authToken: token,
      responseType: "text",
      headers: {
        Accept: "application/xml",
      },
    });
  }

  async getSessionUpo(referenceNumber: string, upoReferenceNumber: string): Promise<string> {
    const token = await this.getAccessToken();
    return this.http.request<string>({
      method: "GET",
      path: `/sessions/${encodeURIComponent(referenceNumber)}/upo/${encodeURIComponent(
        upoReferenceNumber,
      )}`,
      authToken: token,
      responseType: "text",
      headers: {
        Accept: "application/xml",
      },
    });
  }

  async getSessionFailedInvoices(
    referenceNumber: string,
    pageSize?: number,
    continuationToken?: string,
  ): Promise<SessionFailedInvoicesResponse> {
    const token = await this.getAccessToken();
    const headers =
      continuationToken !== undefined ? { "x-continuation-token": continuationToken } : undefined;
    return this.http.request<SessionFailedInvoicesResponse>({
      method: "GET",
      path: `/sessions/${encodeURIComponent(referenceNumber)}/invoices/failed`,
      ...(headers ? { headers } : {}),
      query: {
        pageSize,
      },
      authToken: token,
    });
  }

  async openOnlineSession(
    request: OpenOnlineSessionRequest,
    upoV43?: boolean,
  ): Promise<OpenOnlineSessionResponse> {
    const token = await this.getAccessToken();
    return this.http.request<OpenOnlineSessionResponse>({
      method: "POST",
      path: "/sessions/online",
      body: request,
      ...(upoV43 ? { headers: { "X-KSeF-Feature": "upo-v4-3" } } : {}),
      authToken: token,
    });
  }

  async sendOnlineInvoice(
    referenceNumber: string,
    request: SendInvoiceRequest,
  ): Promise<SendInvoiceResponse> {
    const token = await this.getAccessToken();
    return this.http.request<SendInvoiceResponse>({
      method: "POST",
      path: `/sessions/online/${encodeURIComponent(referenceNumber)}/invoices`,
      body: request,
      authToken: token,
    });
  }

  async closeOnlineSession(referenceNumber: string): Promise<void> {
    const token = await this.getAccessToken();
    await this.http.request<void>({
      method: "POST",
      path: `/sessions/online/${encodeURIComponent(referenceNumber)}/close`,
      authToken: token,
    });
  }

  async openBatchSession(
    request: OpenBatchSessionRequest,
    upoV43?: boolean,
  ): Promise<OpenBatchSessionResponse> {
    const token = await this.getAccessToken();
    return this.http.request<OpenBatchSessionResponse>({
      method: "POST",
      path: "/sessions/batch",
      body: request,
      ...(upoV43 ? { headers: { "X-KSeF-Feature": "upo-v4-3" } } : {}),
      authToken: token,
    });
  }

  async closeBatchSession(referenceNumber: string): Promise<void> {
    const token = await this.getAccessToken();
    await this.http.request<void>({
      method: "POST",
      path: `/sessions/batch/${encodeURIComponent(referenceNumber)}/close`,
      authToken: token,
    });
  }
}
