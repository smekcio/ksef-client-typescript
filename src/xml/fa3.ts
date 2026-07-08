import { KsefValidationError } from "../errors/errors";
import { buildFakturaXml, FakturaInput, FakturaXmlOptions } from "./invoice";
import { XmlObject, XmlValue } from "./xml";
import { validateFa3XmlWellFormed } from "./xsd";
import { FA3XsdObject, FA3XsdRootExtension } from "./fa3-xsd-types";

export type FA3InvoiceKind =
  | "basic"
  | "simplified"
  | "correction"
  | "advance"
  | "settlement"
  | "advanceCorrection"
  | "settlementCorrection";

export type FA3PartyIdentifier =
  | { kind: "nip"; value: string }
  | { kind: "euVat"; countryCode: string; value: string }
  | { kind: "foreign"; value: string; countryCode?: string }
  | { kind: "internal"; value: string }
  | { kind: "none" };

export interface FA3Address {
  countryCode?: string;
  line1: string;
  line2?: string;
  line3?: string;
  gln?: string;
}

export interface FA3Contact {
  email?: string;
  phone?: string;
}

export interface FA3PartyInput {
  name: string;
  identifier: FA3PartyIdentifier;
  address?: FA3Address | string;
  taxpayerPrefix?: string;
  taxpayerStatus?: string;
  correspondenceAddress?: FA3Address | string;
  contacts?: FA3Contact[];
  eori?: string;
  customerNumber?: string;
  buyerId?: string;
  role?: string;
  authorizedRole?: string;
  share?: number | string;
  jst?: boolean;
  vatGroup?: boolean;
  otherRoleDescription?: string;
  raw?: FA3XsdObject;
}

export type FA3TaxKind =
  | "23"
  | "22"
  | "8"
  | "7"
  | "5"
  | "4"
  | "3"
  | "0"
  | "0 KR"
  | "0 WDT"
  | "0 EX"
  | "zw"
  | "np I"
  | "np II"
  | "oo"
  | "marza";

export interface FA3TaxCategoryInput {
  rate?: FA3TaxKind | number | string;
  exemptionBasis?: string;
  exemptionBasisType?: "law" | "directive" | "other";
  xiiRate?: number | string;
}

export interface FA3LineIdentifiers {
  uniqueId?: string;
  internalIndex?: string;
  gtin?: string;
  pkwiu?: string;
  cn?: string;
  pkob?: string;
}

export interface FA3InvoiceLineInput {
  description: string;
  quantity: number | string;
  unitNetPrice: number | string;
  tax?: FA3TaxCategoryInput | FA3TaxKind | number | string;
  unit?: string;
  discountAmount?: number | string;
  discountPercent?: number | string;
  serviceDate?: Date | string;
  identifiers?: FA3LineIdentifiers;
  unitGrossPrice?: number | string;
  netAmount?: number | string;
  grossAmount?: number | string;
  vatAmount?: number | string;
  exciseAmount?: number | string;
  gtu?: string;
  procedure?: string;
  currencyRate?: number | string;
  annex15?: boolean;
  beforeCorrection?: boolean;
  raw?: XmlObject;
}

export interface FA3PaymentDueInput {
  date?: Date | string;
  description?: {
    amount: number;
    unit: string;
    startsFrom: string;
  };
}

export interface FA3BankAccountInput {
  number: string;
  swift?: string;
  ownBankAccount?: string;
  bankName?: string;
  description?: string;
}

export interface FA3PartialPaymentInput {
  amount: number | string;
  paidOn: Date | string;
  method?: string;
  otherMethodDescription?: string;
}

export interface FA3PaymentTermsInput {
  paidDate?: Date | string;
  partialPayments?: FA3PartialPaymentInput[];
  dueTerms?: FA3PaymentDueInput[];
  method?: string;
  otherMethodDescription?: string;
  bankAccounts?: FA3BankAccountInput[];
  factorAccounts?: FA3BankAccountInput[];
  cashDiscountTerms?: string;
  cashDiscountAmount?: number | string;
  paymentLink?: string;
  ipksef?: string;
}

export const FA3PaymentMethod = {
  CASH: "1",
  CARD: "2",
  VOUCHER: "3",
  CHECK: "4",
  CREDIT: "5",
  TRANSFER: "6",
  MOBILE: "7",
} as const;

export const FA3CorrectionType = {
  TAX_BASE_OR_TAX: "1",
  OTHER: "2",
  NO_TAX_IMPACT: "3",
} as const;

export const FA3TransportKind = {
  SEA: "1",
  RAIL: "2",
  ROAD: "3",
  AIR: "4",
  POSTAL: "5",
  FIXED_TRANSPORT: "7",
  INLAND_WATERWAY: "8",
} as const;

export const FA3GTUCode = {
  GTU_01: "GTU_01",
  GTU_02: "GTU_02",
  GTU_03: "GTU_03",
  GTU_04: "GTU_04",
  GTU_05: "GTU_05",
  GTU_06: "GTU_06",
  GTU_07: "GTU_07",
  GTU_08: "GTU_08",
  GTU_09: "GTU_09",
  GTU_10: "GTU_10",
  GTU_11: "GTU_11",
  GTU_12: "GTU_12",
  GTU_13: "GTU_13",
} as const;

export interface FA3CorrectionReference {
  invoiceNumber: string;
  issueDate: Date | string;
  ksefNumber?: string;
}

export interface FA3AdvancePaymentInput {
  amount: number | string;
  tax?: FA3TaxCategoryInput | FA3TaxKind | number | string;
  paidOn?: Date | string;
  currencyRate?: number | string;
}

export interface FA3AdvanceReference {
  invoiceNumber?: string;
  ksefNumber?: string;
}

export type FA3OrderLineInput = FA3InvoiceLineInput;

export interface FA3OrderInput {
  totalGross?: number | string;
  lines?: FA3OrderLineInput[];
}

export interface FA3SettlementAdjustment {
  amount: number | string;
  reason: string;
}

export interface FA3SettlementInput {
  charges?: FA3SettlementAdjustment[];
  deductions?: FA3SettlementAdjustment[];
  amountDue?: number | string;
  amountToSettle?: number | string;
}

export interface FA3TransportInput {
  kind?: string;
  otherKindDescription?: string;
  carrier?: FA3PartyInput;
  orderNumber?: string;
  cargoDescription?: string;
  otherCargoDescription?: string;
  packageUnit?: string;
  startedAt?: Date | string;
  finishedAt?: Date | string;
  shipFrom?: FA3Address | string;
  shipVia?: Array<FA3Address | string>;
  shipTo?: FA3Address | string;
  raw?: XmlObject;
}

export interface FA3TransactionTermsInput {
  contracts?: Array<{ number?: string; date?: Date | string }>;
  orders?: Array<{ number?: string; date?: Date | string }>;
  batchNumbers?: string[];
  deliveryTerms?: string;
  contractualRate?: number | string;
  contractualCurrency?: string;
  intermediary?: boolean;
  transports?: Array<FA3TransportInput | FA3XsdObject>;
  raw?: FA3XsdObject;
}

export interface FA3NewTransportMeansInput {
  allowedDate: Date | string;
  rowNumber: number;
  kind: "land" | "water" | "air" | string;
  mileage?: number | string;
  hoursUsed?: number | string;
  serialNumber?: string;
  registryNumber?: string;
  approvalNumber?: string;
  make?: string;
  model?: string;
  color?: string;
  manufactureYear?: string;
  engineCapacity?: number | string;
  enginePower?: number | string;
  taxRate?: string;
  raw?: FA3XsdObject;
}

export interface FA3FooterInput {
  infos?: string[];
  registries?: Array<{
    fullName?: string;
    krs?: string;
    regon?: string;
    bdo?: string;
  }>;
  raw?: FA3XsdObject;
}

export interface FA3AttachmentInput {
  blocks?: FA3AttachmentBlockInput[];
  raw?: FA3XsdObject;
}

export interface FA3AttachmentBlockInput {
  header?: string;
  metadata?: Array<{ key: string; value: string }>;
  paragraphs?: string[];
  tables?: FA3AttachmentTableInput[];
}

export interface FA3AttachmentTableInput {
  metadata?: Array<{ key: string; value: string }>;
  description?: string;
  headers: string[];
  columnTypes?: string[];
  rows: string[][];
  footer?: string[];
}

export interface FA3InvoiceBuildData {
  kind: FA3InvoiceKind;
  invoiceNumber: string;
  issueDate: Date | string;
  currency: string;
  seller: FA3PartyInput;
  buyer: FA3PartyInput;
  issuePlace?: string;
  saleDate?: Date | string;
  periodFrom?: Date | string;
  periodTo?: Date | string;
  warehouseDocuments?: string[];
  lines: FA3InvoiceLineInput[];
  additionalParties?: FA3PartyInput[];
  authorizedParty?: FA3PartyInput;
  paymentTerms?: FA3PaymentTermsInput;
  correctionReason?: string;
  correctionType?: string;
  correctedInvoices?: FA3CorrectionReference[];
  correctedPeriod?: string;
  correctedInvoiceNumberOverride?: string;
  correctedSeller?: FA3PartyInput;
  correctedBuyers?: FA3PartyInput[];
  correctedAdditionalParties?: FA3PartyInput[];
  correctedAdvanceState?: { amount: number | string; currencyRate?: number | string };
  advancePayments?: FA3AdvancePaymentInput[];
  advanceInvoices?: FA3AdvanceReference[];
  settlement?: FA3SettlementInput;
  order?: FA3OrderInput;
  transactionTerms?: FA3TransactionTermsInput;
  additionalDescriptions?: Array<{ key: string; value: string }>;
  annotations?: Partial<FA3AnnotationFlags>;
  foreignCurrencyRate?: number | string;
  fiscalReceiptInvoice?: boolean;
  relatedPartyTransaction?: boolean;
  exciseRefund?: boolean;
  footer?: FA3FooterInput;
  attachment?: FA3AttachmentInput;
  simplifiedReceiptLike?: boolean;
  rawFa?: FA3XsdObject;
  rawRoot?: FA3XsdRootExtension;
  systemInfo?: string;
  createdAt?: Date | string;
}

export interface FA3AnnotationFlags {
  cashMethod: boolean;
  selfBilling: boolean;
  reverseCharge: boolean;
  splitPayment: boolean;
  simplifiedTriangular: boolean;
  exemptionBasis?: string;
  exemptionBasisType?: "law" | "directive" | "other";
  newTransport: boolean;
  newTransportIntraEu: boolean;
  newTransportMeans?: Array<FA3NewTransportMeansInput | FA3XsdObject>;
  marginProcedure?: "travel" | "used_goods" | "art" | "collectibles" | string;
}

const INVOICE_KIND_XML_CODE: Record<FA3InvoiceKind, string> = {
  basic: "VAT",
  simplified: "UPR",
  correction: "KOR",
  advance: "ZAL",
  settlement: "ROZ",
  advanceCorrection: "KOR_ZAL",
  settlementCorrection: "KOR_ROZ",
};

type SummaryTags = { net: string; vat?: string; vatPln?: string };

const TAX_SUMMARY: Record<string, SummaryTags> = {
  "23": { net: "P_13_1", vat: "P_14_1", vatPln: "P_14_1W" },
  "22": { net: "P_13_1", vat: "P_14_1", vatPln: "P_14_1W" },
  "8": { net: "P_13_2", vat: "P_14_2", vatPln: "P_14_2W" },
  "7": { net: "P_13_2", vat: "P_14_2", vatPln: "P_14_2W" },
  "5": { net: "P_13_3", vat: "P_14_3", vatPln: "P_14_3W" },
  "4": { net: "P_13_4", vat: "P_14_4", vatPln: "P_14_4W" },
  "3": { net: "P_13_4", vat: "P_14_4", vatPln: "P_14_4W" },
  xii: { net: "P_13_5", vat: "P_14_5" },
  "0 KR": { net: "P_13_6_1" },
  "0 WDT": { net: "P_13_6_2" },
  "0 EX": { net: "P_13_6_3" },
  zw: { net: "P_13_7" },
  "np I": { net: "P_13_8" },
  "np II": { net: "P_13_9" },
  oo: { net: "P_13_10" },
  marza: { net: "P_13_11" },
};

const SUMMARY_ORDER = [
  ["P_13_1", "P_14_1", "P_14_1W"],
  ["P_13_2", "P_14_2", "P_14_2W"],
  ["P_13_3", "P_14_3", "P_14_3W"],
  ["P_13_4", "P_14_4", "P_14_4W"],
  ["P_13_5", "P_14_5"],
  ["P_13_6_1"],
  ["P_13_6_2"],
  ["P_13_6_3"],
  ["P_13_7"],
  ["P_13_8"],
  ["P_13_9"],
  ["P_13_10"],
  ["P_13_11"],
] as const;

export class FA3Party {
  static polishCompany(options: {
    nip: string;
    name: string;
    address?: FA3Address | string;
    contacts?: FA3Contact[];
  }): FA3PartyInput {
    return {
      name: options.name,
      identifier: { kind: "nip", value: options.nip },
      ...(options.address !== undefined ? { address: options.address } : {}),
      ...(options.contacts !== undefined ? { contacts: options.contacts } : {}),
    };
  }

  static euCompany(options: {
    vatId: string;
    countryCode: string;
    name: string;
    address?: FA3Address | string;
    contacts?: FA3Contact[];
  }): FA3PartyInput {
    return {
      name: options.name,
      identifier: { kind: "euVat", countryCode: options.countryCode, value: options.vatId },
      ...(options.address !== undefined ? { address: options.address } : {}),
      ...(options.contacts !== undefined ? { contacts: options.contacts } : {}),
    };
  }

  static foreignCompany(options: {
    identifier: string;
    countryCode: string;
    name: string;
    address?: FA3Address | string;
  }): FA3PartyInput {
    return {
      name: options.name,
      identifier: {
        kind: "foreign",
        value: options.identifier,
        countryCode: options.countryCode,
      },
      ...(options.address !== undefined ? { address: options.address } : {}),
    };
  }

  static withoutTaxId(options: {
    name: string;
    address?: FA3Address | string;
    countryCode?: string;
  }): FA3PartyInput {
    const address = normalizeAddress(options.address, options.countryCode);
    return {
      name: options.name,
      identifier: { kind: "none" },
      ...(address !== undefined ? { address } : {}),
    };
  }

  static internalEntity(options: {
    id: string;
    name: string;
    address?: FA3Address | string;
  }): FA3PartyInput {
    return {
      name: options.name,
      identifier: { kind: "internal", value: options.id },
      ...(options.address !== undefined ? { address: options.address } : {}),
    };
  }
}

export class FA3TaxCategory {
  static standard23(): FA3TaxCategoryInput {
    return { rate: "23" };
  }

  static standard22(): FA3TaxCategoryInput {
    return { rate: "22" };
  }

  static reduced8(): FA3TaxCategoryInput {
    return { rate: "8" };
  }

  static reduced7(): FA3TaxCategoryInput {
    return { rate: "7" };
  }

  static reduced5(): FA3TaxCategoryInput {
    return { rate: "5" };
  }

  static taxiFlatRate(rate: "4" | "3" = "4"): FA3TaxCategoryInput {
    return { rate };
  }

  static zeroDomestic(): FA3TaxCategoryInput {
    return { rate: "0 KR" };
  }

  static zeroWdt(): FA3TaxCategoryInput {
    return { rate: "0 WDT" };
  }

  static zeroExport(): FA3TaxCategoryInput {
    return { rate: "0 EX" };
  }

  static exempt(basis: string, basisType: "law" | "directive" | "other" = "law"): FA3TaxCategoryInput {
    return { rate: "zw", exemptionBasis: basis, exemptionBasisType: basisType };
  }

  static outsideCountry(): FA3TaxCategoryInput {
    return { rate: "np I" };
  }

  static serviceArticle100(): FA3TaxCategoryInput {
    return { rate: "np II" };
  }

  static reverseCharge(): FA3TaxCategoryInput {
    return { rate: "oo" };
  }

  static margin(): FA3TaxCategoryInput {
    return { rate: "marza" };
  }

  static xii(rate: number | string): FA3TaxCategoryInput {
    return { rate: "xii", xiiRate: rate };
  }

  static fromRate(rate: FA3TaxKind | number | string): FA3TaxCategoryInput {
    return { rate };
  }
}

export class FA3Invoice {
  constructor(private readonly data: FA3InvoiceBuildData) {}

  static basic(invoiceNumber: string): FA3InvoiceBuilder {
    return new FA3InvoiceBuilder(invoiceNumber, "basic");
  }

  static simplified(invoiceNumber: string): FA3InvoiceBuilder {
    return new FA3InvoiceBuilder(invoiceNumber, "simplified");
  }

  static correction(invoiceNumber: string): FA3InvoiceBuilder {
    return new FA3InvoiceBuilder(invoiceNumber, "correction");
  }

  static advance(invoiceNumber: string): FA3InvoiceBuilder {
    return new FA3InvoiceBuilder(invoiceNumber, "advance");
  }

  static settlement(invoiceNumber: string): FA3InvoiceBuilder {
    return new FA3InvoiceBuilder(invoiceNumber, "settlement");
  }

  static advanceCorrection(invoiceNumber: string): FA3InvoiceBuilder {
    return new FA3InvoiceBuilder(invoiceNumber, "advanceCorrection");
  }

  static settlementCorrection(invoiceNumber: string): FA3InvoiceBuilder {
    return new FA3InvoiceBuilder(invoiceNumber, "settlementCorrection");
  }

  validate(): void {
    validateBuildData(this.data);
  }

  toFakturaInput(): FakturaInput {
    this.validate();
    return buildFakturaInput(this.data);
  }

  toXml(options?: FakturaXmlOptions): string {
    return buildFakturaXml(this.toFakturaInput(), { schema: "FA3", ...options });
  }

  toXmlWellFormed(options?: FakturaXmlOptions): string {
    const xml = this.toXml(options);
    validateFa3XmlWellFormed(xml);
    return xml;
  }

  toBuffer(options?: FakturaXmlOptions): Buffer {
    return Buffer.from(this.toXml(options), "utf8");
  }

  toBufferWellFormed(options?: FakturaXmlOptions): Buffer {
    return Buffer.from(this.toXmlWellFormed(options), "utf8");
  }
}

export class FA3InvoiceBuilder {
  private data: FA3InvoiceBuildData;

  constructor(invoiceNumber: string, kind: FA3InvoiceKind) {
    this.data = {
      kind,
      invoiceNumber,
      issueDate: new Date(),
      currency: "PLN",
      seller: FA3Party.polishCompany({ nip: "", name: "" }),
      buyer: FA3Party.polishCompany({ nip: "", name: "" }),
      lines: [],
      annotations: {},
      systemInfo: "ksef-client-typescript",
    };
  }

  seller(party: FA3PartyInput): this {
    this.data.seller = party;
    return this;
  }

  buyer(party: FA3PartyInput): this {
    this.data.buyer = party;
    return this;
  }

  issueDate(value: Date | string): this {
    this.data.issueDate = value;
    return this;
  }

  createdAt(value: Date | string): this {
    this.data.createdAt = value;
    return this;
  }

  issuePlace(value: string): this {
    this.data.issuePlace = value;
    return this;
  }

  currency(value: string): this {
    this.data.currency = value.toUpperCase();
    return this;
  }

  saleDate(value: Date | string): this {
    this.data.saleDate = value;
    return this;
  }

  salePeriod(from: Date | string, to: Date | string): this {
    this.data.periodFrom = from;
    this.data.periodTo = to;
    return this;
  }

  systemInfo(value: string): this {
    this.data.systemInfo = value;
    return this;
  }

  addLine(line: FA3InvoiceLineInput): this {
    this.data.lines.push(line);
    return this;
  }

  addGoodsLine(
    description: string,
    options: Omit<FA3InvoiceLineInput, "description">,
  ): this {
    return this.addLine({ description, ...options });
  }

  addServiceLine(
    description: string,
    options: Omit<FA3InvoiceLineInput, "description">,
  ): this {
    return this.addLine({ description, ...options });
  }

  additionalParty(party: FA3PartyInput): this {
    this.data.additionalParties = [...(this.data.additionalParties ?? []), party];
    return this;
  }

  authorizedParty(party: FA3PartyInput): this {
    this.data.authorizedParty = party;
    return this;
  }

  warehouseDocument(number: string): this {
    this.data.warehouseDocuments = [...(this.data.warehouseDocuments ?? []), number];
    return this;
  }

  splitPayment(required = true): this {
    return this.annotation({ splitPayment: required });
  }

  cashMethod(required = true): this {
    return this.annotation({ cashMethod: required });
  }

  selfBilling(required = true): this {
    return this.annotation({ selfBilling: required });
  }

  reverseCharge(required = true): this {
    return this.annotation({ reverseCharge: required });
  }

  simplifiedTriangular(required = true): this {
    return this.annotation({ simplifiedTriangular: required });
  }

  exemption(basis: string, basisType: "law" | "directive" | "other" = "law"): this {
    return this.annotation({ exemptionBasis: basis, exemptionBasisType: basisType });
  }

  margin(procedure: FA3AnnotationFlags["marginProcedure"] = "used_goods"): this {
    return this.annotation({ marginProcedure: procedure });
  }

  newTransport(means?: FA3NewTransportMeansInput | FA3XsdObject, intraEu = false): this {
    const current = this.data.annotations?.newTransportMeans ?? [];
    return this.annotation({
      newTransport: true,
      newTransportIntraEu: intraEu || Boolean(this.data.annotations?.newTransportIntraEu),
      newTransportMeans: means ? [...current, means] : current,
    });
  }

  newTransportMeans(means: FA3NewTransportMeansInput | FA3XsdObject, intraEu = false): this {
    const current = this.data.annotations?.newTransportMeans ?? [];
    return this.annotation({
      newTransport: true,
      newTransportIntraEu: intraEu || Boolean(this.data.annotations?.newTransportIntraEu),
      newTransportMeans: [...current, means],
    });
  }

  paymentDue(date: Date | string, method = "6"): this {
    const current = this.data.paymentTerms ?? {};
    this.data.paymentTerms = {
      ...current,
      method,
      dueTerms: [...(current.dueTerms ?? []), { date }],
    };
    return this;
  }

  paymentDueDescription(amount: number, unit: string, startsFrom: string, method = "6"): this {
    const current = this.data.paymentTerms ?? {};
    this.data.paymentTerms = {
      ...current,
      method,
      dueTerms: [...(current.dueTerms ?? []), { description: { amount, unit, startsFrom } }],
    };
    return this;
  }

  paid(paidDate: Date | string): this {
    this.data.paymentTerms = { ...(this.data.paymentTerms ?? {}), paidDate };
    return this;
  }

  partiallyPaid(input: FA3PartialPaymentInput): this {
    const current = this.data.paymentTerms ?? {};
    this.data.paymentTerms = {
      ...current,
      partialPayments: [...(current.partialPayments ?? []), input],
    };
    return this;
  }

  bankAccount(input: FA3BankAccountInput, factor = false): this {
    const current = this.data.paymentTerms ?? {};
    if (factor) {
      this.data.paymentTerms = {
        ...current,
        factorAccounts: [...(current.factorAccounts ?? []), input],
      };
    } else {
      this.data.paymentTerms = {
        ...current,
        bankAccounts: [...(current.bankAccounts ?? []), input],
      };
    }
    return this;
  }

  cashDiscount(terms: string, amount: number | string): this {
    this.data.paymentTerms = {
      ...(this.data.paymentTerms ?? {}),
      cashDiscountTerms: terms,
      cashDiscountAmount: amount,
    };
    return this;
  }

  paymentTerms(input: FA3PaymentTermsInput): this {
    this.data.paymentTerms = input;
    return this;
  }

  correctsInvoice(input: FA3CorrectionReference & { reason: string; correctionType?: string }): this {
    this.data.correctionReason = input.reason;
    if (input.correctionType !== undefined) {
      this.data.correctionType = input.correctionType;
    }
    const reference: FA3CorrectionReference = {
      invoiceNumber: input.invoiceNumber,
      issueDate: input.issueDate,
      ...(input.ksefNumber !== undefined ? { ksefNumber: input.ksefNumber } : {}),
    };
    this.data.correctedInvoices = [
      ...(this.data.correctedInvoices ?? []),
      reference,
    ];
    return this;
  }

  correctsMany(
    references: FA3CorrectionReference[],
    options: { reason: string; correctionType?: string },
  ): this {
    this.data.correctionReason = options.reason;
    if (options.correctionType !== undefined) {
      this.data.correctionType = options.correctionType;
    }
    this.data.correctedInvoices = [...(this.data.correctedInvoices ?? []), ...references];
    return this;
  }

  correctionType(value: string): this {
    this.data.correctionType = value;
    return this;
  }

  correctedSeller(party: FA3PartyInput): this {
    this.data.correctedSeller = party;
    return this;
  }

  correctedBuyer(party: FA3PartyInput): this {
    this.data.correctedBuyers = [...(this.data.correctedBuyers ?? []), party];
    return this;
  }

  correctedAdditionalParty(party: FA3PartyInput): this {
    this.data.correctedAdditionalParties = [...(this.data.correctedAdditionalParties ?? []), party];
    return this;
  }

  correctedPeriod(value: string): this {
    this.data.correctedPeriod = value;
    return this;
  }

  correctedInvoiceNumberOverride(value: string): this {
    this.data.correctedInvoiceNumberOverride = value;
    return this;
  }

  correctedAdvanceState(amount: number | string, currencyRate?: number | string): this {
    this.data.correctedAdvanceState = {
      amount,
      ...(currencyRate !== undefined ? { currencyRate } : {}),
    };
    return this;
  }

  addCorrectedLineBeforeAfter(before: FA3InvoiceLineInput, after: FA3InvoiceLineInput): this {
    this.data.lines.push({ ...before, beforeCorrection: true }, { ...after, beforeCorrection: false });
    return this;
  }

  advancePayment(input: FA3AdvancePaymentInput): this {
    this.data.advancePayments = [...(this.data.advancePayments ?? []), input];
    return this;
  }

  settlesAdvance(input: FA3AdvanceReference): this {
    this.data.advanceInvoices = [...(this.data.advanceInvoices ?? []), input];
    return this;
  }

  settlesAdvances(references: FA3AdvanceReference[]): this {
    this.data.advanceInvoices = [...(this.data.advanceInvoices ?? []), ...references];
    return this;
  }

  settlement(input: FA3SettlementInput): this {
    this.data.settlement = input;
    return this;
  }

  remainingToPay(amount: number | string): this {
    this.data.settlement = { ...(this.data.settlement ?? {}), amountDue: amount };
    return this;
  }

  documentDiscount(amount: number | string, reason: string): this {
    const current = this.data.settlement ?? {};
    this.data.settlement = {
      ...current,
      deductions: [...(current.deductions ?? []), { amount, reason }],
    };
    return this;
  }

  documentCharge(amount: number | string, reason: string): this {
    const current = this.data.settlement ?? {};
    this.data.settlement = {
      ...current,
      charges: [...(current.charges ?? []), { amount, reason }],
    };
    return this;
  }

  order(input: FA3OrderInput): this {
    this.data.order = input;
    return this;
  }

  orderLine(line: FA3OrderLineInput): this {
    const current = this.data.order ?? {};
    this.data.order = { ...current, lines: [...(current.lines ?? []), line] };
    return this;
  }

  transactionTerms(input: FA3TransactionTermsInput): this {
    this.data.transactionTerms = input;
    return this;
  }

  contract(input: { number?: string; date?: Date | string }): this {
    const current = this.data.transactionTerms ?? {};
    this.data.transactionTerms = {
      ...current,
      contracts: [...(current.contracts ?? []), input],
    };
    return this;
  }

  orderReference(input: { number?: string; date?: Date | string }): this {
    const current = this.data.transactionTerms ?? {};
    this.data.transactionTerms = {
      ...current,
      orders: [...(current.orders ?? []), input],
    };
    return this;
  }

  batchNumber(value: string): this {
    const current = this.data.transactionTerms ?? {};
    this.data.transactionTerms = {
      ...current,
      batchNumbers: [...(current.batchNumbers ?? []), value],
    };
    return this;
  }

  transport(input: FA3TransportInput): this {
    const current = this.data.transactionTerms ?? {};
    this.data.transactionTerms = {
      ...current,
      transports: [...(current.transports ?? []), input],
    };
    return this;
  }

  additionalDescription(key: string, value: string): this {
    this.data.additionalDescriptions = [
      ...(this.data.additionalDescriptions ?? []),
      { key, value },
    ];
    return this;
  }

  foreignCurrencyRate(value: number | string): this {
    this.data.foreignCurrencyRate = value;
    return this;
  }

  fiscalReceiptInvoice(enabled = true): this {
    this.data.fiscalReceiptInvoice = enabled;
    return this;
  }

  relatedPartyTransaction(enabled = true): this {
    this.data.relatedPartyTransaction = enabled;
    return this;
  }

  exciseRefund(enabled = true): this {
    this.data.exciseRefund = enabled;
    return this;
  }

  footer(input: FA3FooterInput): this {
    this.data.footer = input;
    return this;
  }

  footerInfo(text: string): this {
    const current = this.data.footer ?? {};
    this.data.footer = { ...current, infos: [...(current.infos ?? []), text] };
    return this;
  }

  registry(registry: NonNullable<FA3FooterInput["registries"]>[number]): this {
    const current = this.data.footer ?? {};
    this.data.footer = { ...current, registries: [...(current.registries ?? []), registry] };
    return this;
  }

  attachment(input: FA3AttachmentInput): this {
    this.data.attachment = input;
    return this;
  }

  attachmentText(header: string, ...paragraphs: string[]): this {
    return this.attachmentBlock({ header, paragraphs });
  }

  attachmentTable(input: {
    header?: string;
    columns: string[];
    rows: string[][];
    description?: string;
    columnTypes?: string[];
    footer?: string[];
  }): this {
    return this.attachmentBlock({
      ...(input.header !== undefined ? { header: input.header } : {}),
      tables: [
        {
          headers: input.columns,
          rows: input.rows,
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.columnTypes !== undefined ? { columnTypes: input.columnTypes } : {}),
          ...(input.footer !== undefined ? { footer: input.footer } : {}),
        },
      ],
    });
  }

  attachmentBlock(block: FA3AttachmentBlockInput): this {
    const current = this.data.attachment ?? {};
    this.data.attachment = { ...current, blocks: [...(current.blocks ?? []), block] };
    return this;
  }

  asSimplifiedReceiptLike(): this {
    this.data.simplifiedReceiptLike = true;
    return this;
  }

  withRawFa(fields: FA3XsdObject): this {
    this.data.rawFa = { ...(this.data.rawFa ?? {}), ...fields };
    return this;
  }

  withRawRoot(fields: FA3XsdRootExtension): this {
    this.data.rawRoot = { ...(this.data.rawRoot ?? {}), ...omitReservedRootFields(fields) };
    return this;
  }

  build(): FA3Invoice {
    const invoice = new FA3Invoice(cloneData(this.data));
    invoice.validate();
    return invoice;
  }

  private annotation(flags: Partial<FA3AnnotationFlags>): this {
    this.data.annotations = { ...(this.data.annotations ?? {}), ...flags };
    return this;
  }
}

function buildFakturaInput(data: FA3InvoiceBuildData): FakturaInput {
  const fa = buildFa(data);
  return {
    ...(data.rawRoot ? omitReservedRootFields(data.rawRoot) : {}),
    Naglowek: {
      KodFormularza: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
      WariantFormularza: "3",
      DataWytworzeniaFa: dateTimeToString(data.createdAt ?? new Date()),
      SystemInfo: data.systemInfo ?? "ksef-client-typescript",
    },
    Podmiot1: partyToXml(data.seller, { seller: true }),
    Podmiot2: partyToXml(data.buyer, { buyer: true }),
    ...(data.additionalParties?.length
      ? { Podmiot3: data.additionalParties.map((party) => partyToXml(party, { thirdParty: true })) }
      : {}),
    ...(data.authorizedParty
      ? { PodmiotUpowazniony: partyToXml(data.authorizedParty, { authorized: true }) }
      : {}),
    Fa: fa,
    ...(data.footer ? { Stopka: footerToXml(data.footer) } : {}),
    ...(data.attachment ? { Zalacznik: attachmentToXml(data.attachment) } : {}),
  };
}

const RESERVED_ROOT_FIELDS = new Set([
  "Naglowek",
  "Podmiot1",
  "Podmiot2",
  "Podmiot3",
  "PodmiotUpowazniony",
  "Fa",
  "Stopka",
  "Zalacznik",
]);

function omitReservedRootFields(fields: FA3XsdRootExtension): XmlObject {
  const result: XmlObject = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!RESERVED_ROOT_FIELDS.has(key)) {
      result[key] = value;
    }
  }
  return result;
}

function buildFa(data: FA3InvoiceBuildData): XmlObject {
  const summary = taxSummary(data);
  const fa: XmlObject = {
    KodWaluty: data.currency.toUpperCase(),
    P_1: dateToString(data.issueDate),
    ...(data.issuePlace ? { P_1M: data.issuePlace } : {}),
    P_2: data.invoiceNumber,
    ...(data.warehouseDocuments?.length ? { WZ: data.warehouseDocuments } : {}),
    ...(data.saleDate ? { P_6: dateToString(data.saleDate) } : {}),
    ...(!data.saleDate && data.periodFrom && data.periodTo
      ? { OkresFa: { P_6_Od: dateToString(data.periodFrom), P_6_Do: dateToString(data.periodTo) } }
      : {}),
    ...summary,
    ...(data.foreignCurrencyRate !== undefined
      ? { KursWalutyZ: decimalToString(decimal(data.foreignCurrencyRate)) }
      : {}),
    Adnotacje: annotationsToXml(mergeAnnotations(data)),
    RodzajFaktury: INVOICE_KIND_XML_CODE[data.kind],
    ...correctionToXml(data),
    ...(data.advancePayments?.length
      ? {
          ZaliczkaCzesciowa: data.advancePayments.map((payment) => ({
            P_6Z: dateToString(payment.paidOn ?? data.issueDate),
            P_15Z: moneyString(decimal(payment.amount)),
            ...(payment.currencyRate !== undefined
              ? { KursWalutyZW: decimalToString(decimal(payment.currencyRate)) }
              : {}),
          })),
        }
      : {}),
    ...(data.fiscalReceiptInvoice ? { FP: "1" } : {}),
    ...(data.relatedPartyTransaction ? { TP: "1" } : {}),
    ...(data.additionalDescriptions?.length
      ? {
          DodatkowyOpis: data.additionalDescriptions.map((item) => ({
            Klucz: item.key,
            Wartosc: item.value,
          })),
        }
      : {}),
    ...(data.advanceInvoices?.length
      ? {
          FakturaZaliczkowa: data.advanceInvoices.map((item) => ({
            ...(item.ksefNumber
              ? { NrKSeFFaZaliczkowej: item.ksefNumber }
              : { NrKSeFZN: "1", ...(item.invoiceNumber ? { NrFaZaliczkowej: item.invoiceNumber } : {}) }),
          })),
        }
      : {}),
    ...(data.exciseRefund ? { ZwrotAkcyzy: "1" } : {}),
    ...(data.lines.length
      ? { FaWiersz: data.lines.map((line, index) => lineToXml(line, index + 1)) }
      : {}),
    ...(data.settlement ? { Rozliczenie: settlementToXml(data.settlement) } : {}),
    ...(data.paymentTerms ? { Platnosc: paymentToXml(data.paymentTerms, decimalFromSummaryTotal(summary)) } : {}),
    ...(data.transactionTerms ? { WarunkiTransakcji: transactionTermsToXml(data.transactionTerms) } : {}),
    ...(data.order ? { Zamowienie: orderToXml(data.order) } : {}),
  };
  return mergeFaWithRawFa(fa, data.rawFa);
}

const FA_MERGE_ARRAY_KEYS = [
  "DodatkowyOpis",
  "FaWiersz",
  "ZaliczkaCzesciowa",
  "FakturaZaliczkowa",
  "Podmiot2K",
  "DaneFaKorygowanej",
] as const;

const FA_MERGE_OBJECT_KEYS = [
  "Platnosc",
  "Rozliczenie",
  "WarunkiTransakcji",
  "Zamowienie",
  "Podmiot1K",
] as const;

function asXmlObjectArray(value: XmlValue | XmlValue[] | undefined): XmlObject[] {
  if (value === undefined) {
    return [];
  }
  return (Array.isArray(value) ? value : [value]).filter(
    (item): item is XmlObject => typeof item === "object" && item !== null && !Array.isArray(item),
  );
}

function shallowMergeObjects(
  managed: XmlValue | undefined,
  raw: XmlValue | undefined,
): XmlObject {
  const managedObject =
    typeof managed === "object" && managed !== null && !Array.isArray(managed) ? managed : {};
  const rawObject = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw : {};
  return { ...managedObject, ...rawObject };
}

function mergeFaWithRawFa(fa: XmlObject, rawFa: XmlObject | undefined): XmlObject {
  if (!rawFa) {
    return fa;
  }

  const result: XmlObject = { ...fa };
  const handledKeys = new Set<string>();

  for (const key of FA_MERGE_ARRAY_KEYS) {
    const managed = fa[key];
    const raw = rawFa[key];
    if (managed === undefined && raw === undefined) {
      continue;
    }
    result[key] = [...asXmlObjectArray(managed), ...asXmlObjectArray(raw)];
    handledKeys.add(key);
  }

  for (const key of FA_MERGE_OBJECT_KEYS) {
    const managed = fa[key];
    const raw = rawFa[key];
    if (managed === undefined && raw === undefined) {
      continue;
    }
    result[key] = shallowMergeObjects(managed, raw);
    handledKeys.add(key);
  }

  for (const [key, value] of Object.entries(rawFa)) {
    if (!handledKeys.has(key)) {
      result[key] = value;
    }
  }

  return result;
}

function partyToXml(
  party: FA3PartyInput,
  options: { seller?: boolean; buyer?: boolean; thirdParty?: boolean; authorized?: boolean },
): XmlObject {
  const result: XmlObject = {};
  if ((options.seller || options.authorized) && party.taxpayerPrefix) {
    result.PrefiksPodatnika = party.taxpayerPrefix;
  }
  if (options.thirdParty && party.buyerId) {
    result.IDNabywcy = party.buyerId;
  }
  if (party.eori) {
    result.NrEORI = party.eori;
  }
  result.DaneIdentyfikacyjne = partyIdentityToXml(party, Boolean(options.seller || options.authorized));
  if (party.address) {
    result.Adres = addressToXml(party.address);
  }
  if (party.correspondenceAddress) {
    result.AdresKoresp = addressToXml(party.correspondenceAddress);
  }
  if (party.contacts?.length) {
    result.DaneKontaktowe = party.contacts.slice(0, 3).map((contact) => ({
      ...(contact.email ? { [options.authorized ? "EmailPU" : "Email"]: contact.email } : {}),
      ...(contact.phone ? { [options.authorized ? "TelefonPU" : "Telefon"]: contact.phone } : {}),
    }));
  }
  if (options.buyer) {
    if (party.customerNumber) {
      result.NrKlienta = party.customerNumber;
    }
    if (party.buyerId) {
      result.IDNabywcy = party.buyerId;
    }
    result.JST = yesNo(Boolean(party.jst));
    result.GV = yesNo(Boolean(party.vatGroup));
  }
  if (options.seller && party.taxpayerStatus) {
    result.StatusInfoPodatnika = party.taxpayerStatus;
  }
  if (options.thirdParty) {
    if (party.role === "other") {
      result.RolaInna = "1";
      if (party.otherRoleDescription) {
        result.OpisRoli = party.otherRoleDescription;
      }
    } else if (party.role) {
      result.Rola = party.role;
    }
    if (party.share !== undefined) {
      result.Udzial = decimalToString(decimal(party.share));
    }
  }
  if (options.authorized) {
    result.RolaPU = party.authorizedRole ?? "3";
  }
  return { ...result, ...(party.raw ?? {}) };
}

function correctedSellerToXml(party: FA3PartyInput): XmlObject {
  if (!party.address) {
    throw new KsefValidationError("correctedSeller.address is required for Podmiot1K.");
  }
  const result: XmlObject = {
    DaneIdentyfikacyjne: partyIdentityToXml(party, true),
    Adres: addressToXml(party.address),
  };
  if (party.taxpayerPrefix) {
    result.PrefiksPodatnika = party.taxpayerPrefix;
  }
  return { ...result, ...(party.raw ?? {}) };
}

function correctedPartyToXml(party: FA3PartyInput): XmlObject {
  const result: XmlObject = {
    DaneIdentyfikacyjne: buyerIdentityToXml(party),
  };
  if (party.address) {
    result.Adres = addressToXml(party.address);
  }
  if (party.buyerId) {
    result.IDNabywcy = party.buyerId;
  }
  return { ...result, ...(party.raw ?? {}) };
}

function buyerIdentityToXml(party: FA3PartyInput): XmlObject {
  const id = party.identifier;
  if (id.kind === "internal") {
    throw new KsefValidationError(
      "Podmiot2K does not support internal (IDWew) identifiers; use NIP, EU VAT, foreign ID, or BrakID.",
    );
  }
  const result: XmlObject = {};
  if (id.kind === "nip") {
    result.NIP = id.value;
  } else if (id.kind === "euVat") {
    result.KodUE = id.countryCode.toUpperCase();
    result.NrVatUE = id.value;
  } else if (id.kind === "foreign") {
    if (id.countryCode) {
      result.KodKraju = id.countryCode.toUpperCase();
    }
    result.NrID = id.value;
  } else {
    result.BrakID = "1";
  }
  result.Nazwa = party.name;
  return result;
}

function partyIdentityToXml(party: FA3PartyInput, requiresNip: boolean): XmlObject {
  const id = party.identifier;
  if (requiresNip && id.kind !== "nip") {
    throw new KsefValidationError("Podmiot1/PodmiotUpowazniony requires NIP identifier.");
  }
  const result: XmlObject = {};
  if (id.kind === "nip") {
    result.NIP = id.value;
  } else if (id.kind === "euVat") {
    result.KodUE = id.countryCode.toUpperCase();
    result.NrVatUE = id.value;
  } else if (id.kind === "foreign") {
    if (id.countryCode) {
      result.KodKraju = id.countryCode.toUpperCase();
    }
    result.NrID = id.value;
  } else if (id.kind === "internal") {
    result.IDWew = id.value;
  } else {
    result.BrakID = "1";
  }
  result.Nazwa = party.name;
  return result;
}

function addressToXml(input: FA3Address | string): XmlObject {
  const address = normalizeAddress(input);
  if (!address) {
    throw new KsefValidationError("Address is required.");
  }
  return {
    KodKraju: address.countryCode ?? "PL",
    AdresL1: address.line1,
    ...(address.line2 ? { AdresL2: address.line2 } : {}),
    ...(address.line3 ? { AdresL3: address.line3 } : {}),
    ...(address.gln ? { GLN: address.gln } : {}),
  };
}

function lineToXml(input: FA3InvoiceLineInput, rowNumber: number, suffix = ""): XmlObject {
  const line = normalizeLine(input);
  return {
    [`NrWierszaFa${suffix}`]: rowNumber,
    ...(line.identifiers?.uniqueId ? { [`UU_ID${suffix}`]: line.identifiers.uniqueId } : {}),
    ...(line.serviceDate ? { [`P_6A${suffix}`]: dateToString(line.serviceDate) } : {}),
    [`P_7${suffix}`]: line.description,
    ...(line.identifiers?.internalIndex ? { [`Indeks${suffix}`]: line.identifiers.internalIndex } : {}),
    ...(line.identifiers?.gtin ? { [`GTIN${suffix}`]: line.identifiers.gtin } : {}),
    ...(line.identifiers?.pkwiu ? { [`PKWiU${suffix}`]: line.identifiers.pkwiu } : {}),
    ...(line.identifiers?.cn ? { [`CN${suffix}`]: line.identifiers.cn } : {}),
    ...(line.identifiers?.pkob ? { [`PKOB${suffix}`]: line.identifiers.pkob } : {}),
    [`P_8A${suffix}`]: line.unit,
    [`P_8B${suffix}`]: decimalToString(line.quantity),
    [`P_9A${suffix}`]: amount2String(line.unitNetPrice),
    ...(line.unitGrossPrice !== undefined ? { [`P_9B${suffix}`]: amount2String(line.unitGrossPrice) } : {}),
    ...(line.discountAmount > 0 ? { [`P_10${suffix}`]: amount2String(line.discountAmount) } : {}),
    [`P_11${suffix}`]: moneyString(line.netAmount),
    ...(line.grossAmountOverride !== undefined ? { [`P_11A${suffix}`]: moneyString(line.grossAmount) } : {}),
    ...(line.tax.vatRate !== undefined || line.vatAmountOverride !== undefined
      ? { [`P_11Vat${suffix}`]: moneyString(line.vatAmount) }
      : {}),
    ...(line.tax.xmlRate ? { [`P_12${suffix}`]: line.tax.xmlRate } : {}),
    ...(line.tax.xiiRate !== undefined ? { [`P_12${suffix}_XII`]: decimalToString(line.tax.xiiRate) } : {}),
    ...(line.annex15 ? { [`P_12${suffix}_Zal_15`]: "1" } : {}),
    ...(line.exciseAmount !== undefined ? { [`KwotaAkcyzy${suffix}`]: moneyString(line.exciseAmount) } : {}),
    ...(line.gtu ? { [`GTU${suffix}`]: line.gtu } : {}),
    ...(line.procedure ? { [`Procedura${suffix}`]: line.procedure } : {}),
    ...(line.currencyRate !== undefined ? { [`KursWaluty${suffix}`]: decimalToString(line.currencyRate) } : {}),
    ...(line.beforeCorrection ? { [`StanPrzed${suffix}`]: "1" } : {}),
    ...(line.raw ?? {}),
  };
}

function taxSummary(data: FA3InvoiceBuildData): XmlObject {
  const values = new Map<string, number>();
  const add = (tag: string | undefined, amount: number): void => {
    if (!tag) {
      return;
    }
    values.set(tag, roundMoney((values.get(tag) ?? 0) + amount));
  };
  for (const input of data.lines) {
    const line = normalizeLine(input);
    const tags = TAX_SUMMARY[line.tax.summaryKey];
    if (!tags) {
      continue;
    }
    const sign = input.beforeCorrection ? -1 : 1;
    add(tags.net, sign * line.netAmount);
    add(tags.vat, sign * line.vatAmount);
    if (tags.vatPln && data.currency.toUpperCase() !== "PLN") {
      const rate = line.currencyRate ?? numberOrUndefined(data.foreignCurrencyRate);
      if (rate !== undefined) {
        add(tags.vatPln, sign * roundMoney(line.vatAmount * rate));
      }
    }
  }
  for (const payment of data.advancePayments ?? []) {
    const tax = normalizeTax(payment.tax);
    const tags = TAX_SUMMARY[tax.summaryKey];
    if (!tags) {
      continue;
    }
    const gross = decimal(payment.amount);
    const net = tax.vatRate === undefined ? gross : roundMoney(gross / (1 + tax.vatRate / 100));
    const vat = roundMoney(gross - net);
    add(tags.net, net);
    add(tags.vat, vat);
  }

  const result: XmlObject = {};
  for (const group of SUMMARY_ORDER) {
    for (const tag of group) {
      const value = values.get(tag);
      if (value !== undefined) {
        result[tag] = moneyString(value);
      }
    }
  }
  const total = data.lines.reduce((sum, input) => {
    const line = normalizeLine(input);
    return roundMoney(sum + (input.beforeCorrection ? -line.grossAmount : line.grossAmount));
  }, 0);
  const advances = (data.advancePayments ?? []).reduce((sum, payment) => sum + decimal(payment.amount), 0);
  result.P_15 = moneyString(total + advances);
  return result;
}

function mergeAnnotations(data: FA3InvoiceBuildData): FA3AnnotationFlags {
  const annotations: FA3AnnotationFlags = {
    cashMethod: false,
    selfBilling: false,
    reverseCharge: false,
    splitPayment: false,
    simplifiedTriangular: false,
    newTransport: false,
    newTransportIntraEu: false,
    ...data.annotations,
  };
  for (const line of data.lines) {
    const tax = normalizeTax(line.tax);
    if (tax.summaryKey === "oo") {
      annotations.reverseCharge = true;
    }
    if (tax.exemptionBasis && !annotations.exemptionBasis) {
      annotations.exemptionBasis = tax.exemptionBasis;
      if (tax.exemptionBasisType !== undefined) {
        annotations.exemptionBasisType = tax.exemptionBasisType;
      }
    }
    if (tax.summaryKey === "marza" && !annotations.marginProcedure) {
      annotations.marginProcedure = "used_goods";
    }
  }
  return annotations;
}

function annotationsToXml(annotations: FA3AnnotationFlags): XmlObject {
  return {
    P_16: yesNo(annotations.cashMethod),
    P_17: yesNo(annotations.selfBilling),
    P_18: yesNo(annotations.reverseCharge),
    P_18A: yesNo(annotations.splitPayment),
    Zwolnienie: annotations.exemptionBasis
      ? {
          P_19: "1",
          [annotations.exemptionBasisType === "directive"
            ? "P_19B"
            : annotations.exemptionBasisType === "other"
              ? "P_19C"
              : "P_19A"]: annotations.exemptionBasis,
        }
      : { P_19N: "1" },
    NoweSrodkiTransportu: annotations.newTransport
      ? {
          P_22: "1",
          P_42_5: yesNo(annotations.newTransportIntraEu),
          ...(annotations.newTransportMeans?.length
            ? { NowySrodekTransportu: annotations.newTransportMeans.map(newTransportMeansToXml) }
            : {}),
        }
      : { P_22N: "1" },
    P_23: yesNo(annotations.simplifiedTriangular),
    PMarzy: annotations.marginProcedure
      ? {
          P_PMarzy: "1",
          [marginTag(annotations.marginProcedure)]: "1",
        }
      : { P_PMarzyN: "1" },
  };
}

function correctionToXml(data: FA3InvoiceBuildData): XmlObject {
  if (!["correction", "advanceCorrection", "settlementCorrection"].includes(data.kind)) {
    return {};
  }
  return {
    ...(data.correctionReason ? { PrzyczynaKorekty: data.correctionReason } : {}),
    ...(data.correctionType ? { TypKorekty: data.correctionType } : {}),
    ...(data.correctedInvoices?.length
      ? {
          DaneFaKorygowanej: data.correctedInvoices.map((item) => ({
            DataWystFaKorygowanej: dateToString(item.issueDate),
            NrFaKorygowanej: item.invoiceNumber,
            ...(item.ksefNumber
              ? { NrKSeF: "1", NrKSeFFaKorygowanej: item.ksefNumber }
              : { NrKSeFN: "1" }),
          })),
        }
      : {}),
    ...(data.correctedPeriod ? { OkresFaKorygowanej: data.correctedPeriod } : {}),
    ...(data.correctedInvoiceNumberOverride
      ? { NrFaKorygowany: data.correctedInvoiceNumberOverride }
      : {}),
    ...(data.correctedSeller ? { Podmiot1K: correctedSellerToXml(data.correctedSeller) } : {}),
    ...(data.correctedBuyers?.length || data.correctedAdditionalParties?.length
      ? {
          Podmiot2K: [
            ...(data.correctedBuyers ?? []).map(correctedPartyToXml),
            ...(data.correctedAdditionalParties ?? []).map(correctedPartyToXml),
          ],
        }
      : {}),
    ...(data.correctedAdvanceState
      ? {
          P_15ZK: moneyString(decimal(data.correctedAdvanceState.amount)),
          ...(data.correctedAdvanceState.currencyRate !== undefined
            ? { KursWalutyZK: decimalToString(decimal(data.correctedAdvanceState.currencyRate)) }
            : {}),
        }
      : {}),
  };
}

function paymentToXml(payment: FA3PaymentTermsInput, totalGross: number): XmlObject {
  const partialPayments = payment.partialPayments ?? [];
  return {
    ...(payment.paidDate ? { Zaplacono: "1", DataZaplaty: dateToString(payment.paidDate) } : {}),
    ...(!payment.paidDate && partialPayments.length
      ? {
          ZnacznikZaplatyCzesciowej:
            roundMoney(partialPayments.reduce((sum, item) => sum + decimal(item.amount), 0)) ===
            roundMoney(totalGross)
              ? "2"
              : "1",
          ZaplataCzesciowa: partialPayments.map((item) => ({
            KwotaZaplatyCzesciowej: moneyString(decimal(item.amount)),
            DataZaplatyCzesciowej: dateToString(item.paidOn),
            ...(item.otherMethodDescription
              ? { PlatnoscInna: "1", OpisPlatnosci: item.otherMethodDescription }
              : item.method
                ? { FormaPlatnosci: item.method }
                : {}),
          })),
        }
      : {}),
    ...(payment.dueTerms?.length
      ? {
          TerminPlatnosci: payment.dueTerms.map((term) => ({
            ...(term.date ? { Termin: dateToString(term.date) } : {}),
            ...(term.description
              ? {
                  TerminOpis: {
                    Ilosc: term.description.amount,
                    Jednostka: term.description.unit,
                    ZdarzeniePoczatkowe: term.description.startsFrom,
                  },
                }
              : {}),
          })),
        }
      : {}),
    ...(payment.method ? { FormaPlatnosci: payment.method } : {}),
    ...(payment.otherMethodDescription ? { PlatnoscInna: "1", OpisPlatnosci: payment.otherMethodDescription } : {}),
    ...(payment.bankAccounts?.length
      ? { RachunekBankowy: payment.bankAccounts.map(bankAccountToXml) }
      : {}),
    ...(payment.factorAccounts?.length
      ? { RachunekBankowyFaktora: payment.factorAccounts.map(bankAccountToXml) }
      : {}),
    ...(payment.cashDiscountTerms && payment.cashDiscountAmount !== undefined
      ? {
          Skonto: {
            WarunkiSkonta: payment.cashDiscountTerms,
            WysokoscSkonta: moneyString(decimal(payment.cashDiscountAmount)),
          },
        }
      : {}),
    ...(payment.paymentLink ? { LinkDoPlatnosci: payment.paymentLink } : {}),
    ...(payment.ipksef ? { IPKSeF: payment.ipksef } : {}),
  };
}

function bankAccountToXml(account: FA3BankAccountInput): XmlObject {
  return {
    NrRB: account.number,
    ...(account.swift ? { SWIFT: account.swift } : {}),
    ...(account.ownBankAccount ? { RachunekWlasnyBanku: account.ownBankAccount } : {}),
    ...(account.bankName ? { NazwaBanku: account.bankName } : {}),
    ...(account.description ? { OpisRachunku: account.description } : {}),
  };
}

function settlementToXml(settlement: FA3SettlementInput): XmlObject {
  const charges = settlement.charges ?? [];
  const deductions = settlement.deductions ?? [];
  return {
    ...(charges.length
      ? {
          Obciazenia: charges.map((item) => ({ Kwota: moneyString(decimal(item.amount)), Powod: item.reason })),
          SumaObciazen: moneyString(charges.reduce((sum, item) => sum + decimal(item.amount), 0)),
        }
      : {}),
    ...(deductions.length
      ? {
          Odliczenia: deductions.map((item) => ({ Kwota: moneyString(decimal(item.amount)), Powod: item.reason })),
          SumaOdliczen: moneyString(deductions.reduce((sum, item) => sum + decimal(item.amount), 0)),
        }
      : {}),
    ...(settlement.amountDue !== undefined ? { DoZaplaty: moneyString(decimal(settlement.amountDue)) } : {}),
    ...(settlement.amountToSettle !== undefined
      ? { DoRozliczenia: moneyString(decimal(settlement.amountToSettle)) }
      : {}),
  };
}

function transactionTermsToXml(terms: FA3TransactionTermsInput): XmlObject {
  return {
    ...(terms.contracts?.length
      ? {
          Umowy: terms.contracts.map((item) => ({
            ...(item.date ? { DataUmowy: dateToString(item.date) } : {}),
            ...(item.number ? { NrUmowy: item.number } : {}),
          })),
        }
      : {}),
    ...(terms.orders?.length
      ? {
          Zamowienia: terms.orders.map((item) => ({
            ...(item.date ? { DataZamowienia: dateToString(item.date) } : {}),
            ...(item.number ? { NrZamowienia: item.number } : {}),
          })),
        }
      : {}),
    ...(terms.batchNumbers?.length ? { NrPartiiTowaru: terms.batchNumbers } : {}),
    ...(terms.deliveryTerms ? { WarunkiDostawy: terms.deliveryTerms } : {}),
    ...(terms.contractualRate !== undefined ? { KursUmowny: decimalToString(decimal(terms.contractualRate)) } : {}),
    ...(terms.contractualCurrency ? { WalutaUmowna: terms.contractualCurrency } : {}),
    ...(terms.transports?.length ? { Transport: terms.transports.map(transportToXml) } : {}),
    ...(terms.intermediary ? { PodmiotPosredniczacy: "1" } : {}),
    ...(terms.raw ?? {}),
  };
}

function orderToXml(order: FA3OrderInput): XmlObject {
  const lines = order.lines ?? [];
  const computedTotal = lines.reduce((sum, line) => sum + normalizeLine(line).grossAmount, 0);
  return {
    WartoscZamowienia: moneyString(
      order.totalGross === undefined ? computedTotal : decimal(order.totalGross),
    ),
    ...(lines.length
      ? {
          ZamowienieWiersz: lines.map((line, index) => orderLineToXml(line, index + 1)),
        }
      : {}),
  };
}

function orderLineToXml(input: FA3OrderLineInput, rowNumber: number): XmlObject {
  const line = normalizeLine(input);
  return {
    NrWierszaZam: rowNumber,
    ...(line.identifiers?.uniqueId ? { UU_IDZ: line.identifiers.uniqueId } : {}),
    P_7Z: line.description,
    ...(line.identifiers?.internalIndex ? { IndeksZ: line.identifiers.internalIndex } : {}),
    ...(line.identifiers?.gtin ? { GTINZ: line.identifiers.gtin } : {}),
    ...(line.identifiers?.pkwiu ? { PKWiUZ: line.identifiers.pkwiu } : {}),
    ...(line.identifiers?.cn ? { CNZ: line.identifiers.cn } : {}),
    ...(line.identifiers?.pkob ? { PKOBZ: line.identifiers.pkob } : {}),
    P_8AZ: line.unit,
    P_8BZ: decimalToString(line.quantity),
    P_9AZ: amount2String(line.unitNetPrice),
    ...(line.discountAmount > 0 ? { P_10Z: amount2String(line.discountAmount) } : {}),
    P_11NettoZ: moneyString(line.netAmount),
    P_11VatZ: moneyString(line.vatAmount),
    ...(line.tax.xmlRate ? { P_12Z: line.tax.xmlRate } : {}),
    ...(line.tax.xiiRate !== undefined ? { P_12Z_XII: decimalToString(line.tax.xiiRate) } : {}),
    ...(line.annex15 ? { P_12Z_Zal_15: "1" } : {}),
    ...(line.gtu ? { GTUZ: line.gtu } : {}),
    ...(line.procedure ? { ProceduraZ: line.procedure } : {}),
    ...(line.exciseAmount !== undefined ? { KwotaAkcyzyZ: moneyString(line.exciseAmount) } : {}),
    ...(line.beforeCorrection ? { StanPrzedZ: "1" } : {}),
    ...(line.raw ?? {}),
  };
}

function footerToXml(footer: FA3FooterInput): XmlObject {
  return {
    ...(footer.infos?.length
      ? { Informacje: footer.infos.map((text) => ({ StopkaFaktury: text })) }
      : {}),
    ...(footer.registries?.length
      ? {
          Rejestry: footer.registries.map((item) => ({
            ...(item.fullName ? { PelnaNazwa: item.fullName } : {}),
            ...(item.krs ? { KRS: item.krs } : {}),
            ...(item.regon ? { REGON: item.regon } : {}),
            ...(item.bdo ? { BDO: item.bdo } : {}),
          })),
        }
      : {}),
    ...(footer.raw ?? {}),
  };
}

function attachmentToXml(attachment: FA3AttachmentInput): XmlObject {
  return {
    ...(attachment.blocks?.length
      ? { BlokDanych: attachment.blocks.map(attachmentBlockToXml) }
      : {}),
    ...(attachment.raw ?? {}),
  };
}

function attachmentBlockToXml(block: FA3AttachmentBlockInput): XmlObject {
  return {
    ...(block.header ? { ZNaglowek: block.header } : {}),
    ...(block.metadata?.length
      ? { MetaDane: block.metadata.map((item) => ({ ZKlucz: item.key, ZWartosc: item.value })) }
      : {}),
    ...(block.paragraphs?.length ? { Tekst: { Akapit: block.paragraphs } } : {}),
    ...(block.tables?.length ? { Tabela: block.tables.map(attachmentTableToXml) } : {}),
  };
}

function attachmentTableToXml(table: FA3AttachmentTableInput): XmlObject {
  return {
    ...(table.metadata?.length
      ? { TMetaDane: table.metadata.map((item) => ({ TKlucz: item.key, TWartosc: item.value })) }
      : {}),
    ...(table.description ? { Opis: table.description } : {}),
    TNaglowek: {
      Kol: table.headers.map((header, index) => ({
        "@_Typ": table.columnTypes?.[index] ?? "txt",
        NKom: header,
      })),
    },
    Wiersz: table.rows.map((row) => ({ WKom: row })),
    ...(table.footer?.length ? { Suma: { SKom: table.footer } } : {}),
  };
}

function newTransportMeansToXml(input: FA3NewTransportMeansInput | XmlObject): XmlObject {
  if (!isNewTransportMeansInput(input)) {
    return input;
  }
  const common: XmlObject = {
    P_22A: dateToString(input.allowedDate),
    P_NrWierszaNST: input.rowNumber,
    ...(input.make ? { P_22BMK: input.make } : {}),
    ...(input.model ? { P_22BMD: input.model } : {}),
    ...(input.color ? { P_22BK: input.color } : {}),
    ...(input.registryNumber ? { P_22BNR: input.registryNumber } : {}),
    ...(input.manufactureYear ? { P_22BRP: input.manufactureYear } : {}),
  };
  if (input.kind === "water") {
    return {
      ...common,
      P_22C: decimalToString(decimal(input.hoursUsed ?? 0)),
      ...(input.serialNumber ? { P_22C1: input.serialNumber } : {}),
      ...(input.raw ?? {}),
    };
  }
  if (input.kind === "air") {
    return {
      ...common,
      P_22D: decimalToString(decimal(input.hoursUsed ?? 0)),
      ...(input.serialNumber ? { P_22D1: input.serialNumber } : {}),
      ...(input.raw ?? {}),
    };
  }
  return {
    ...common,
    P_22B: decimalToString(decimal(input.mileage ?? 0)),
    ...(input.serialNumber
      ? { P_22B1: input.serialNumber }
      : input.engineCapacity !== undefined
        ? { P_22B2: decimalToString(decimal(input.engineCapacity)) }
        : input.enginePower !== undefined
          ? { P_22B3: decimalToString(decimal(input.enginePower)) }
          : input.approvalNumber
            ? { P_22B4: input.approvalNumber }
            : {}),
    ...(input.taxRate ? { P_22BT: input.taxRate } : {}),
    ...(input.raw ?? {}),
  };
}

function transportToXml(input: FA3TransportInput | XmlObject): XmlObject {
  if (!isTransportInput(input)) {
    return input;
  }
  return {
    ...(input.otherKindDescription
      ? { TransportInny: "1", OpisInnegoTransportu: input.otherKindDescription }
      : { RodzajTransportu: input.kind ?? FA3TransportKind.ROAD }),
    ...(input.carrier
      ? {
          Przewoznik: {
            DaneIdentyfikacyjne: partyIdentityToXml(input.carrier, false),
            ...(input.carrier.address ? { AdresPrzewoznika: addressToXml(input.carrier.address) } : {}),
          },
        }
      : {}),
    ...(input.orderNumber ? { NrZleceniaTransportu: input.orderNumber } : {}),
    ...(input.otherCargoDescription
      ? { LadunekInny: "1", OpisInnegoLadunku: input.otherCargoDescription }
      : input.cargoDescription !== undefined
        ? { OpisLadunku: input.cargoDescription }
        : {}),
    ...(input.packageUnit ? { JednostkaOpakowania: input.packageUnit } : {}),
    ...(input.startedAt ? { DataGodzRozpTransportu: dateTimeToString(input.startedAt) } : {}),
    ...(input.finishedAt ? { DataGodzZakTransportu: dateTimeToString(input.finishedAt) } : {}),
    ...(input.shipFrom ? { WysylkaZ: addressToXml(input.shipFrom) } : {}),
    ...(input.shipVia?.length ? { WysylkaPrzez: input.shipVia.map(addressToXml) } : {}),
    ...(input.shipTo ? { WysylkaDo: addressToXml(input.shipTo) } : {}),
    ...(input.raw ?? {}),
  };
}

function normalizeLine(input: FA3InvoiceLineInput): RequiredNormalizedLine {
  const quantity = decimal(input.quantity);
  const unitNetPrice = decimal(input.unitNetPrice);
  const tax = normalizeTax(input.tax);
  const baseNet = roundMoney(quantity * unitNetPrice);
  const discountAmount =
    input.discountAmount !== undefined
      ? decimal(input.discountAmount)
      : input.discountPercent !== undefined
        ? roundMoney(baseNet * decimal(input.discountPercent) / 100)
        : 0;
  const netAmount = input.netAmount !== undefined ? decimal(input.netAmount) : roundMoney(baseNet - discountAmount);
  const vatAmount =
    input.vatAmount !== undefined
      ? decimal(input.vatAmount)
      : tax.vatRate === undefined
        ? 0
        : roundMoney(netAmount * tax.vatRate / 100);
  const grossAmount =
    input.grossAmount !== undefined ? decimal(input.grossAmount) : roundMoney(netAmount + vatAmount);
  const rest: Omit<
    RequiredNormalizedLine,
    | "quantity"
    | "unitNetPrice"
    | "tax"
    | "unit"
    | "discountAmount"
    | "netAmount"
    | "vatAmount"
    | "grossAmount"
  > = {
    description: input.description,
    ...(input.serviceDate !== undefined ? { serviceDate: input.serviceDate } : {}),
    ...(input.identifiers !== undefined ? { identifiers: input.identifiers } : {}),
    ...(input.gtu !== undefined ? { gtu: input.gtu } : {}),
    ...(input.procedure !== undefined ? { procedure: input.procedure } : {}),
    ...(input.annex15 !== undefined ? { annex15: input.annex15 } : {}),
    ...(input.beforeCorrection !== undefined ? { beforeCorrection: input.beforeCorrection } : {}),
    ...(input.raw !== undefined ? { raw: input.raw } : {}),
  };
  const normalized: RequiredNormalizedLine = {
    ...rest,
    unit: input.unit ?? "szt",
    quantity,
    unitNetPrice,
    tax,
    discountAmount,
    netAmount,
    vatAmount,
    grossAmount,
  };
  if (input.grossAmount !== undefined) {
    normalized.grossAmountOverride = grossAmount;
  }
  if (input.vatAmount !== undefined) {
    normalized.vatAmountOverride = vatAmount;
  }
  if (input.unitGrossPrice !== undefined) {
    normalized.unitGrossPrice = decimal(input.unitGrossPrice);
  }
  if (input.exciseAmount !== undefined) {
    normalized.exciseAmount = decimal(input.exciseAmount);
  }
  if (input.currencyRate !== undefined) {
    normalized.currencyRate = decimal(input.currencyRate);
  }
  return normalized;
}

interface RequiredNormalizedLine
  extends Omit<
    FA3InvoiceLineInput,
    | "quantity"
    | "unitNetPrice"
    | "tax"
    | "unitGrossPrice"
    | "exciseAmount"
    | "currencyRate"
    | "discountAmount"
    | "netAmount"
    | "vatAmount"
    | "grossAmount"
  > {
  quantity: number;
  unitNetPrice: number;
  tax: NormalizedTaxCategory;
  unit: string;
  discountAmount: number;
  netAmount: number;
  vatAmount: number;
  grossAmount: number;
  grossAmountOverride?: number;
  vatAmountOverride?: number;
  unitGrossPrice?: number;
  exciseAmount?: number;
  currencyRate?: number;
}

interface NormalizedTaxCategory {
  summaryKey: string;
  xmlRate?: string;
  vatRate?: number;
  xiiRate?: number;
  exemptionBasis?: string;
  exemptionBasisType?: "law" | "directive" | "other";
}

function normalizeTax(input: FA3InvoiceLineInput["tax"] | FA3AdvancePaymentInput["tax"]): NormalizedTaxCategory {
  const value: FA3TaxCategoryInput =
    isTaxCategoryInput(input)
      ? input
      : { rate: input ?? "23" };
  const rate = String(value.rate ?? "23").trim();
  if (rate === "xii") {
    return { summaryKey: "xii", xiiRate: decimal(value.xiiRate ?? "12"), vatRate: decimal(value.xiiRate ?? "12") };
  }
  if (rate === "0") {
    return { summaryKey: "0 KR", xmlRate: "0 KR", vatRate: 0 };
  }
  if (rate === "zw") {
    return {
      summaryKey: "zw",
      xmlRate: "zw",
      exemptionBasis: value.exemptionBasis ?? "zwolnienie",
      exemptionBasisType: value.exemptionBasisType ?? "law",
    };
  }
  if (rate === "marza") {
    return { summaryKey: "marza" };
  }
  if (["np I", "np II", "oo", "0 KR", "0 WDT", "0 EX"].includes(rate)) {
    return {
      summaryKey: rate,
      xmlRate: rate,
      ...(rate.startsWith("0 ") ? { vatRate: 0 } : {}),
    };
  }
  const vatRate = decimal(rate);
  const xmlRate = decimalToString(vatRate);
  const summaryKey = TAX_SUMMARY[xmlRate] ? xmlRate : "23";
  return { summaryKey, xmlRate, vatRate };
}

function isTaxCategoryInput(input: unknown): input is FA3TaxCategoryInput {
  return Boolean(input) && typeof input === "object" && !Array.isArray(input);
}

function validateBuildData(data: FA3InvoiceBuildData): void {
  const errors: string[] = [];
  if (!data.invoiceNumber.trim()) {
    errors.push("invoiceNumber is required.");
  }
  if (!data.currency.trim()) {
    errors.push("currency is required.");
  }
  validateParty(data.seller, "seller", true, errors);
  validateParty(data.buyer, "buyer", false, errors);
  if (!data.lines.length && !data.advancePayments?.length) {
    errors.push("At least one line or advance payment is required.");
  }
  data.lines.forEach((line, index) => {
    if (!line.description.trim()) {
      errors.push(`lines[${index}].description is required.`);
    }
    if (decimal(line.quantity) <= 0) {
      errors.push(`lines[${index}].quantity must be greater than zero.`);
    }
    if (decimal(line.unitNetPrice) < 0) {
      errors.push(`lines[${index}].unitNetPrice cannot be negative.`);
    }
  });
  if (["correction", "advanceCorrection", "settlementCorrection"].includes(data.kind)) {
    if (!data.correctionReason) {
      errors.push("correctionReason is required for correction invoices.");
    }
    if (!data.correctedInvoices?.length) {
      errors.push("correctedInvoices are required for correction invoices.");
    }
  }
  if (data.kind === "settlement" && !data.advanceInvoices?.length) {
    errors.push("advanceInvoices are required for settlement invoices.");
  }
  if (data.annotations?.newTransport && !data.annotations?.newTransportMeans?.length) {
    errors.push("newTransport requires at least one newTransportMeans entry.");
  }
  if (data.correctedSeller && !data.correctedSeller.address) {
    errors.push("correctedSeller.address is required for Podmiot1K.");
  }
  [...(data.correctedBuyers ?? []), ...(data.correctedAdditionalParties ?? [])].forEach((party, index) => {
    if (party.identifier.kind === "internal") {
      errors.push(
        `correctedParties[${index}] cannot use internal (IDWew) identifier in Podmiot2K.`,
      );
    }
  });
  if (data.simplifiedReceiptLike) {
    const totalGross = data.lines.reduce((sum, input) => sum + normalizeLine(input).grossAmount, 0);
    if (data.currency.toUpperCase() !== "PLN") {
      errors.push("simplifiedReceiptLike requires PLN currency.");
    }
    if (roundMoney(totalGross) > 450) {
      errors.push("simplifiedReceiptLike total gross cannot exceed 450.00 PLN.");
    }
  }
  if (errors.length) {
    throw new KsefValidationError(errors.join(" "));
  }
}

function validateParty(party: FA3PartyInput, label: string, seller: boolean, errors: string[]): void {
  if (!party.name.trim()) {
    errors.push(`${label}.name is required.`);
  }
  if (seller && party.identifier.kind !== "nip") {
    errors.push(`${label}.identifier must be NIP.`);
  }
  if (party.identifier.kind !== "none" && "value" in party.identifier && !party.identifier.value.trim()) {
    errors.push(`${label}.identifier.value is required.`);
  }
  if (party.role === "other" && !party.otherRoleDescription?.trim()) {
    errors.push(`${label}.otherRoleDescription is required for other role.`);
  }
}

function normalizeAddress(input: FA3Address | string | undefined, countryCode = "PL"): FA3Address | undefined {
  if (input === undefined) {
    return undefined;
  }
  if (typeof input === "string") {
    return { countryCode, line1: input };
  }
  return { countryCode: input.countryCode ?? countryCode, ...input };
}

function isUtcMidnight(value: Date): boolean {
  return (
    value.getUTCHours() === 0 &&
    value.getUTCMinutes() === 0 &&
    value.getUTCSeconds() === 0 &&
    value.getUTCMilliseconds() === 0
  );
}

function formatCalendarDate(value: Date, useUtc: boolean): string {
  const year = useUtc ? value.getUTCFullYear() : value.getFullYear();
  const month = String((useUtc ? value.getUTCMonth() : value.getMonth()) + 1).padStart(2, "0");
  const day = String(useUtc ? value.getUTCDate() : value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateToString(value: Date | string): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    const datePrefix = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    if (datePrefix?.[1]) {
      return datePrefix[1];
    }
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      throw new KsefValidationError(`Invalid date value: ${value}`);
    }
    return dateToString(parsed);
  }
  return formatCalendarDate(value, isUtcMidnight(value));
}

function dateTimeToString(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString().replace(/\.\d{3}Z$/, "Z");
  }
  return value;
}

function yesNo(value: boolean): string {
  return value ? "1" : "2";
}

function decimal(value: number | string): number {
  const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(parsed)) {
    throw new KsefValidationError(`Invalid decimal value: ${value}`);
  }
  return parsed;
}

function numberOrUndefined(value: number | string | undefined): number | undefined {
  return value === undefined ? undefined : decimal(value);
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function moneyString(value: number): string {
  return roundMoney(value).toFixed(2);
}

function amount2String(value: number): string {
  return roundMoney(value).toFixed(2);
}

function decimalToString(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value).replace(/0+$/, "").replace(/\.$/, "");
}

function decimalFromSummaryTotal(summary: XmlObject): number {
  const value = summary.P_15;
  return typeof value === "string" || typeof value === "number" ? decimal(value) : 0;
}

function marginTag(value: string): string {
  if (value === "travel") {
    return "P_PMarzy_2";
  }
  if (value === "art") {
    return "P_PMarzy_3_2";
  }
  if (value === "collectibles") {
    return "P_PMarzy_3_3";
  }
  return "P_PMarzy_3_1";
}

function isNewTransportMeansInput(input: FA3NewTransportMeansInput | XmlObject): input is FA3NewTransportMeansInput {
  return (
    typeof (input as { allowedDate?: unknown }).allowedDate !== "undefined" &&
    typeof (input as { rowNumber?: unknown }).rowNumber === "number" &&
    typeof (input as { kind?: unknown }).kind === "string"
  );
}

function isTransportInput(input: FA3TransportInput | XmlObject): input is FA3TransportInput {
  const candidate = input as FA3TransportInput;
  return (
    candidate.kind !== undefined ||
    candidate.otherKindDescription !== undefined ||
    candidate.carrier !== undefined ||
    candidate.orderNumber !== undefined ||
    candidate.shipFrom !== undefined ||
    candidate.shipTo !== undefined
  );
}

function cloneData(data: FA3InvoiceBuildData): FA3InvoiceBuildData {
  return structuredClone(data);
}

export function isFA3InvoiceLike(input: unknown): input is { toFakturaInput: () => FakturaInput } {
  return (
    Boolean(input) &&
    typeof input === "object" &&
    typeof (input as { toFakturaInput?: unknown }).toFakturaInput === "function"
  );
}

export type FA3XmlValue = XmlValue;
