export type FA3InvoiceKind =
  | "basic"
  | "simplified"
  | "correction"
  | "advance"
  | "settlement"
  | "advance_correction"
  | "settlement_correction";

export interface FA3Party {
  name: string;
  taxId: string;
  countryCode?: string;
  addressLine1?: string;
  addressLine2?: string;
  addressLine3?: string;
  email?: string;
  phone?: string;
}

export interface FA3Line {
  description: string;
  quantity: number | string;
  unit: string;
  unitNetPrice: number | string;
  vatRate?: number | string | null;
  netAmount?: number | string;
  vatAmount?: number | string;
  grossAmount?: number | string;
}

export interface FA3ValidationIssue {
  code: string;
  message: string;
  path?: string;
}

export interface FA3DraftInput {
  invoiceNumber: string;
  issueDate: string;
  seller: FA3Party;
  buyer: FA3Party;
  lines: FA3Line[];
  kind?: FA3InvoiceKind;
  currency?: string;
  issuePlace?: string;
  correctionReason?: string;
  correctedInvoiceNumber?: string;
  correctedInvoiceDate?: string;
  correctedKsefNumber?: string;
  advanceInvoiceNumber?: string;
  advanceKsefNumber?: string;
  settlementAmount?: number | string;
}
