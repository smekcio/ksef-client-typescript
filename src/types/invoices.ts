import { EncryptionInfo, JsonObject, StatusInfo } from "./common";

export type InvoiceQueryFilters = JsonObject;

export interface InvoiceExportRequest {
  encryption: EncryptionInfo;
  filters: InvoiceQueryFilters;
}

export interface InvoiceExportInitResponse {
  referenceNumber: string;
}

export interface InvoiceExportStatusResponse {
  status: StatusInfo;
  completedDate?: string | null;
  packageExpirationDate?: string | null;
  package?: InvoicePackage | null;
}

export interface InvoicePackage {
  invoiceCount: number;
  size: number;
  parts: InvoicePackagePart[];
  isTruncated: boolean;
  lastIssueDate?: string | null;
  lastInvoicingDate?: string | null;
  lastPermanentStorageDate?: string | null;
  permanentStorageHwmDate?: string | null;
}

export interface InvoicePackagePart {
  ordinalNumber: number;
  partName: string;
  method: string;
  url: string;
  partSize: number;
  partHash: string;
  encryptedPartSize: number;
  encryptedPartHash: string;
  expirationDate: string;
}

export type InvoiceMetadataResponse = JsonObject;
