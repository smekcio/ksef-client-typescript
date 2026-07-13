import {
  FA3BankAccount,
  FA3Discount,
  FA3Line,
  FA3PartialPayment,
  FA3Party,
  FA3PartyIdentifier,
  FA3PaymentMethod,
  FA3PaymentTerms,
  FA3Settlement,
  FA3SettlementAdjustment,
  FA3TaxCategory,
  FA3ValidationIssue,
} from "./types";
import { PartyIdentifierKind } from "./identifier";

export class FA3ValidationResult {
  readonly errors: FA3ValidationIssue[];
  readonly warnings: FA3ValidationIssue[];

  constructor(errors: FA3ValidationIssue[] = [], warnings: FA3ValidationIssue[] = []) {
    this.errors = errors;
    this.warnings = warnings;
  }
}

export class Address {
  static polish(line1: string, line2?: string, line3?: string): {
    countryCode: "PL";
    line1: string;
    line2?: string;
    line3?: string;
  } {
    return {
      countryCode: "PL",
      line1,
      ...(line2 ? { line2 } : {}),
      ...(line3 ? { line3 } : {}),
    };
  }

  static foreign(
    countryCode: string,
    line1: string,
    line2?: string,
    line3?: string,
  ): { countryCode: string; line1: string; line2?: string; line3?: string } {
    return {
      countryCode: countryCode.toUpperCase(),
      line1,
      ...(line2 ? { line2 } : {}),
      ...(line3 ? { line3 } : {}),
    };
  }
}

export class Contact {
  static create(value: { email?: string; phone?: string }): { email?: string; phone?: string } {
    return { ...value };
  }
}

export const ThirdPartyRole = {
  ORIGINAL_ENTITY: "1",
  ADDITIONAL_BUYER: "2",
  RECIPIENT: "3",
  PAYER: "4",
  JST_SUBUNIT: "8",
  VAT_GROUP_MEMBER: "10",
  OTHER: "11",
} as const;

export const AuthorizedPartyRole = {
  REPRESENTATIVE: "1",
  BAILIFF: "2",
  ENFORCEMENT_AUTHORITY: "3",
} as const;

export { PartyIdentifierKind } from "./identifier";

export class PartyIdentifier {
  static polishNip(value: string): FA3PartyIdentifier {
    return { kind: PartyIdentifierKind.NIP, value };
  }

  static euVat(countryCode: string, vatId: string): FA3PartyIdentifier {
    return {
      kind: PartyIdentifierKind.EU_VAT,
      value: vatId,
      countryCode: countryCode.toUpperCase(),
    };
  }

  static foreign(identifier: string, countryCode?: string): FA3PartyIdentifier {
    return {
      kind: PartyIdentifierKind.FOREIGN,
      value: identifier,
      ...(countryCode ? { countryCode: countryCode.toUpperCase() } : {}),
    };
  }

  static internal(value: string): FA3PartyIdentifier {
    return { kind: PartyIdentifierKind.INTERNAL, value };
  }

  static none(): FA3PartyIdentifier {
    return { kind: PartyIdentifierKind.NONE };
  }
}

export class InvoiceParty {
  static polishCompany(input: {
    nip: string;
    name: string;
    address?: string;
    email?: string;
    phone?: string;
  }): FA3Party {
    return {
      name: input.name,
      taxId: input.nip,
      identifier: PartyIdentifier.polishNip(input.nip),
      ...(input.address ? { addressLine1: input.address } : {}),
      ...(input.email ? { email: input.email } : {}),
      ...(input.phone ? { phone: input.phone } : {}),
    };
  }

  static euCompany(input: {
    vatId: string;
    countryCode: string;
    name: string;
    address?: string;
    email?: string;
    phone?: string;
  }): FA3Party {
    const identifier = PartyIdentifier.euVat(input.countryCode, input.vatId);
    return {
      name: input.name,
      taxId: `${input.countryCode.toUpperCase()}${input.vatId}`,
      identifier,
      countryCode: input.countryCode.toUpperCase(),
      ...(input.address ? { addressLine1: input.address } : {}),
      ...(input.email ? { email: input.email } : {}),
      ...(input.phone ? { phone: input.phone } : {}),
    };
  }

  static foreignCompany(input: {
    identifier: string;
    countryCode: string;
    name: string;
    address?: string;
  }): FA3Party {
    const identifier = PartyIdentifier.foreign(input.identifier, input.countryCode);
    return {
      name: input.name,
      taxId: `${input.countryCode.toUpperCase()}:${input.identifier}`,
      identifier,
      countryCode: input.countryCode.toUpperCase(),
      ...(input.address ? { addressLine1: input.address } : {}),
    };
  }

  static withoutTaxId(input: { name: string; countryCode?: string; address?: string }): FA3Party {
    return {
      name: input.name,
      taxId: "BRAK",
      identifier: PartyIdentifier.none(),
      countryCode: (input.countryCode ?? "PL").toUpperCase(),
      ...(input.address ? { addressLine1: input.address } : {}),
    };
  }
}

export const Party = InvoiceParty;

export class TaxCategory {
  static standard23(): FA3TaxCategory {
    return { code: "23", vatRate: 23 };
  }
  static standard22(): FA3TaxCategory {
    return { code: "22", vatRate: 22 };
  }
  static reduced8(): FA3TaxCategory {
    return { code: "8", vatRate: 8 };
  }
  static reduced7(): FA3TaxCategory {
    return { code: "7", vatRate: 7 };
  }
  static reduced5(): FA3TaxCategory {
    return { code: "5", vatRate: 5 };
  }
  static zeroDomestic(): FA3TaxCategory {
    return { code: "0 KR", vatRate: 0 };
  }
  static zeroWdt(): FA3TaxCategory {
    return { code: "0 WDT", vatRate: 0 };
  }
  static zeroExport(): FA3TaxCategory {
    return { code: "0 EX", vatRate: 0 };
  }
  static exempt(basis: string): FA3TaxCategory {
    return { code: "zw", exemptionBasis: basis, vatRate: null };
  }
  static outsideCountry(): FA3TaxCategory {
    return { code: "np I", vatRate: null };
  }
  static serviceArticle100(): FA3TaxCategory {
    return { code: "np II", vatRate: null };
  }
  static reverseCharge(): FA3TaxCategory {
    return { code: "oo", vatRate: null };
  }
  static xii(rate: number | string): FA3TaxCategory {
    return { xiiVatRate: rate, vatRate: null };
  }
}

export const VatClass = TaxCategory;

export class Discount {
  static amount(value: number | string, reason?: string): FA3Discount {
    return {
      kind: "amount",
      value,
      ...(reason ? { reason } : {}),
    };
  }

  static percent(value: number | string, reason?: string): FA3Discount {
    return {
      kind: "percent",
      value,
      ...(reason ? { reason } : {}),
    };
  }
}

export class InvoiceLine {
  static goods(
    description: string,
    input: {
      quantity: number | string;
      unitNetPrice: number | string;
      unit?: string;
      vatRate?: number | string | null;
      beforeCorrection?: boolean;
      gtu?: string;
      procedure?: string;
      annex15?: boolean;
    },
  ): FA3Line {
    return {
      description,
      quantity: input.quantity,
      unit: input.unit ?? "szt",
      unitNetPrice: input.unitNetPrice,
      ...(input.vatRate !== undefined ? { vatRate: input.vatRate } : {}),
      ...(input.beforeCorrection !== undefined ? { beforeCorrection: input.beforeCorrection } : {}),
      ...(input.gtu !== undefined ? { gtu: input.gtu } : {}),
      ...(input.procedure !== undefined ? { procedure: input.procedure } : {}),
      ...(input.annex15 !== undefined ? { annex15: input.annex15 } : {}),
    };
  }

  static service(description: string, input: Parameters<typeof InvoiceLine.goods>[1]): FA3Line {
    return InvoiceLine.goods(description, input);
  }

  static correctedBefore(
    description: string,
    input: Omit<Parameters<typeof InvoiceLine.goods>[1], "beforeCorrection">,
  ): FA3Line {
    return InvoiceLine.goods(description, { ...input, beforeCorrection: true });
  }

  static correctedAfter(
    description: string,
    input: Omit<Parameters<typeof InvoiceLine.goods>[1], "beforeCorrection">,
  ): FA3Line {
    return InvoiceLine.goods(description, { ...input, beforeCorrection: false });
  }
}

export interface CorrectionReference {
  invoiceNumber: string;
  issueDate?: string;
  ksefNumber?: string;
}

export type BankAccount = FA3BankAccount;

export interface PaymentTerms extends FA3PaymentTerms {
  bankAccounts?: BankAccount[];
  paymentLink?: string;
  ipksef?: string;
}

export class PartialPayment {
  static create(
    amount: number | string,
    paidOn: string,
    options: {
      method?: FA3PaymentMethod;
      otherMethodDescription?: string;
    } = {},
  ): FA3PartialPayment {
    return {
      amount,
      paidOn,
      ...(options.method !== undefined ? { method: options.method } : {}),
      ...(options.otherMethodDescription !== undefined
        ? { otherMethodDescription: options.otherMethodDescription }
        : {}),
    };
  }
}

export class SettlementAdjustment {
  static create(amount: number | string, reason: string): FA3SettlementAdjustment {
    return { amount, reason };
  }
}

export type Settlement = FA3Settlement;

export interface Annotation {
  key: string;
  value: string;
}

export class AnnotationSet {
  readonly items: Annotation[];

  constructor(items: Annotation[] = []) {
    this.items = items;
  }

  static default(): AnnotationSet {
    return new AnnotationSet([]);
  }

  static splitPayment(): Annotation {
    return { key: "split_payment", value: "1" };
  }

  static cashMethod(): Annotation {
    return { key: "cash_method", value: "1" };
  }
}

export interface AttachmentTable {
  headers: string[];
  rows: string[][];
  columnTypes?: string[];
  metadata?: Array<[string, string]>;
  description?: string;
  footer?: string[];
}

export interface AttachmentBlock {
  header?: string;
  metadata?: Array<[string, string]>;
  paragraphs?: string[];
  tables?: AttachmentTable[];
}

export interface Attachment {
  blocks: AttachmentBlock[];
}

export interface RawXmlExtension {
  path: string;
  xml: string;
}
