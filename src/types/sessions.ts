import { EncryptionInfo, FormCode, JsonObject, StatusInfo } from "./common";

export interface OpenOnlineSessionRequest {
  formCode: FormCode;
  encryption: EncryptionInfo;
}

export interface OpenOnlineSessionResponse {
  referenceNumber: string;
  validUntil: string;
}

export interface SendInvoiceRequest {
  invoiceHash: string;
  invoiceSize: number;
  encryptedInvoiceHash: string;
  encryptedInvoiceSize: number;
  encryptedInvoiceContent: string;
  offlineMode?: boolean;
  hashOfCorrectedInvoice?: string | null;
}

export interface SendInvoiceResponse {
  referenceNumber: string;
}

export interface OpenBatchSessionRequest {
  formCode: FormCode;
  batchFile: {
    fileSize: number;
    fileHash: string;
    fileParts: Array<{
      ordinalNumber: number;
      fileSize: number;
      fileHash: string;
    }>;
  };
  encryption: EncryptionInfo;
  offlineMode?: boolean;
}

export interface PartUploadRequest {
  ordinalNumber: number;
  method: string;
  url: string;
  headers: Record<string, string | null>;
}

export interface OpenBatchSessionResponse {
  referenceNumber: string;
  partUploadRequests: PartUploadRequest[];
}

export interface SessionStatusResponse {
  status: StatusInfo;
  invoiceCount: number;
  successfulInvoiceCount: number;
  failedInvoiceCount: number;
  upo?: {
    pages: Array<{
      referenceNumber: string;
      downloadUrl: string;
    }>;
  };
}

export type SessionType = "Online" | "Batch";
export type SessionStatus = "Succeeded" | "InProgress" | "Failed" | "Cancelled";

export interface GetSessionsQueryParams {
  sessionType: SessionType;
  referenceNumber?: string;
  dateCreatedFrom?: string;
  dateCreatedTo?: string;
  dateClosedFrom?: string;
  dateClosedTo?: string;
  dateModifiedFrom?: string;
  dateModifiedTo?: string;
  statuses?: SessionStatus[];
  pageSize?: number;
}

export type SessionsListResponse = JsonObject;
export type SessionInvoicesResponse = JsonObject;
export type SessionInvoiceStatusResponse = JsonObject;
export type SessionFailedInvoicesResponse = JsonObject;
