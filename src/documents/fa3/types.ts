export type FA3InvoiceKind =
  | "basic"
  | "simplified"
  | "correction"
  | "advance"
  | "settlement"
  | "advance_correction"
  | "settlement_correction";

export type FA3PaymentMethod =
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "transfer"
  | "cash"
  | "card"
  | "voucher"
  | "check"
  | "credit"
  | "compensation"
  | "other";

export type FA3CorrectionType =
  | "1"
  | "2"
  | "3"
  | "tax_base_or_tax"
  | "other"
  | "no_tax_impact";

export type FA3MarginProcedure =
  | "travel"
  | "used_goods"
  | "art"
  | "collectibles";

export type FA3TransportKind =
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "7"
  | "8"
  | "road"
  | "rail"
  | "air"
  | "sea"
  | "postal"
  | "fixed_transport"
  | "other";

export type FA3ThirdPartyRole =
  | "1"
  | "2"
  | "recipient"
  | "3"
  | "payer"
  | "4"
  | "jst_subunit"
  | "8"
  | "vat_group_member"
  | "10"
  | "other"
  | "11";

export interface FA3Address {
  countryCode?: string;
  line1: string;
  line2?: string;
  line3?: string;
}

export interface FA3Contact {
  email?: string;
  phone?: string;
}

export type FA3PartyIdentifierKind = "NIP" | "EU_VAT" | "FOREIGN" | "INTERNAL" | "NONE";

export interface FA3PartyIdentifier {
  kind: FA3PartyIdentifierKind;
  value?: string;
  countryCode?: string;
}

export interface FA3Party {
  name: string;
  taxId: string;
  /** Jawny identyfikator strony (jak PartyIdentifier w Python SDK). Gdy brak — wywnioskowany z taxId. */
  identifier?: FA3PartyIdentifier;
  countryCode?: string;
  internalId?: string;
  eori?: string;
  buyerId?: string;
  customerNumber?: string;
  addressLine1?: string;
  addressLine2?: string;
  addressLine3?: string;
  email?: string;
  phone?: string;
  role?: FA3ThirdPartyRole;
  otherRoleDescription?: string;
  share?: number | string;
  isJstSubunit?: boolean;
  isVatGroupMember?: boolean;
}

export interface FA3TaxCategory {
  code?:
    | "23"
    | "22"
    | "8"
    | "7"
    | "5"
    | "4"
    | "3"
    | "0 KR"
    | "0 WDT"
    | "0 EX"
    | "zw"
    | "np I"
    | "np II"
    | "oo";
  vatRate?: number | string | null;
  /** Stawka VAT w procedurze działu XII rozdz. 6a ustawy → pole XML P_12_XII (TProcentowy). */
  xiiVatRate?: number | string | null;
  exemptionBasis?: string;
  exemptionBasisType?: "law" | "directive" | "other";
}

export interface FA3Discount {
  kind: "amount" | "percent";
  value: number | string;
  reason?: string;
}

export interface FA3Line {
  description: string;
  quantity: number | string;
  unit: string;
  unitNetPrice: number | string;
  vatRate?: number | string | null;
  /**
   * Kod stawki FA(3) P_12 (np. "23", "zw", "0 KR").
   * Gdy podany — używany w P_12 i kubełkach P_13_x / P_14_x; vatRate nadal do wyliczenia kwot.
   */
  vatCode?: string;
  /** Kwota VAT w PLN (faktura walutowa) — sumowana do P_14_xW. */
  vatAmountPln?: number | string | null;
  /** Stawka VAT w procedurze działu XII rozdz. 6a ustawy → pole XML P_12_XII (TProcentowy). */
  xiiVatRate?: number | string | null;
  netAmount?: number | string;
  vatAmount?: number | string;
  grossAmount?: number | string;
  discount?: FA3Discount;
  beforeCorrection?: boolean;
  uniqueId?: string;
  serviceDate?: string;
  periodFrom?: string;
  periodTo?: string;
  gtu?: string;
  procedure?: string;
  annex15?: boolean;
}

export interface FA3AdvanceReference {
  invoiceNumber?: string;
  ksefNumber?: string;
}

export interface FA3AdvancePayment {
  amount: number | string;
  vatRate?: number | string | null;
  paidOn?: string;
  currencyRate?: number | string;
}

export interface FA3SettlementAdjustment {
  amount: number | string;
  reason: string;
}

export interface FA3Settlement {
  amountDue?: number | string;
  amountToSettle?: number | string;
  charges?: FA3SettlementAdjustment[];
  deductions?: FA3SettlementAdjustment[];
}

export interface FA3PartialPayment {
  amount: number | string;
  paidOn: string;
  method?: FA3PaymentMethod;
  otherMethodDescription?: string;
}

export interface FA3BankAccount {
  number: string;
  swift?: string;
  bankName?: string;
  description?: string;
  ownBankAccountType?: "1" | "2" | "3";
}

export interface FA3PaymentDueDescription {
  amount: number | string;
  unit: string;
  startsFrom: string;
}

export interface FA3PaymentTerms {
  dueDate?: string;
  dueDescription?: string;
  dueDescriptionParts?: FA3PaymentDueDescription;
  method?: FA3PaymentMethod;
  otherMethodDescription?: string;
  paidDate?: string;
  partialPayments?: FA3PartialPayment[];
  bankAccounts?: FA3BankAccount[];
  factorBankAccounts?: FA3BankAccount[];
  paymentLink?: string;
  ipksef?: string;
}

export interface FA3ValidationIssue {
  code: string;
  message: string;
  path?: string;
}

export interface FA3ContractSection {
  number: string;
  date?: string;
}

export interface FA3OrderLineSection {
  description: string;
  quantity: number | string;
  unitNetPrice: number | string;
  vatRate?: number | string | null;
  xiiVatRate?: number | string | null;
}

export interface FA3OrderSection {
  number?: string;
  date?: string;
  totalGross?: number | string;
  lines?: FA3OrderLineSection[];
}

export interface FA3TransportSection {
  kind: string;
  orderNumber?: string;
  cargoDescription?: string;
  packageUnit?: string;
}

export interface FA3TransactionTermsSection {
  deliveryTerms?: string;
  contractualRate?: string;
  contractualCurrency?: string;
  intermediary?: boolean;
}

export interface FA3AdditionalDescriptionSection {
  key: string;
  value: string;
}

export interface FA3AttachmentTableSection {
  headers: string[];
  rows: string[][];
}

export interface FA3AttachmentBlockSection {
  header?: string;
  paragraphs?: string[];
  tables?: FA3AttachmentTableSection[];
}

export interface FA3AttachmentSection {
  blocks: FA3AttachmentBlockSection[];
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
  saleDate?: string;
  periodFrom?: string;
  periodTo?: string;
  correctionReason?: string;
  correctionType?: FA3CorrectionType | string;
  correctedInvoiceNumber?: string;
  correctedInvoiceDate?: string;
  correctedKsefNumber?: string;
  correctedPeriod?: string;
  correctedInvoiceNumberOverride?: string;
  advanceInvoiceNumber?: string;
  advanceKsefNumber?: string;
  settlementAmount?: number | string;
  settlement?: FA3Settlement;
  paymentTerms?: FA3PaymentTerms;
  advancePayments?: FA3AdvancePayment[];
  additionalParties?: FA3Party[];
  marginProcedure?: FA3MarginProcedure;
  splitPaymentAnnotation?: boolean;
  transportKind?: FA3TransportKind;
  foreignCurrencyRate?: number | string;
  simplifiedReceiptLike?: boolean;
  rawExtensions?: Array<{ path: string; xml: string }>;
  attachmentText?: string;
  contract?: FA3ContractSection;
  order?: FA3OrderSection;
  transport?: FA3TransportSection;
  transactionTerms?: FA3TransactionTermsSection;
  additionalDescriptions?: FA3AdditionalDescriptionSection[];
  attachment?: FA3AttachmentSection;
}
