import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { createZip } from "../../utils/zip";
import { buildFakturaXml, FakturaInput } from "../../xml/invoice";
import { XmlObject } from "../../xml/xml";
import { KsefValidationError } from "../../errors/errors";
import {
  FA3DraftInput,
  FA3InvoiceKind,
  FA3Line,
  FA3Party,
  FA3ValidationIssue,
} from "./types";
import { validateFa3XmlXsd } from "./xsd";

interface FA3XmlOptions {
  pretty?: boolean;
  xsdValidate?: boolean;
}

const KIND_CODE: Record<FA3InvoiceKind, string> = {
  basic: "VAT",
  simplified: "UPR",
  correction: "KOR",
  advance: "ZAL",
  settlement: "ROZ",
  advance_correction: "KOR_ZAL",
  settlement_correction: "KOR_ROZ",
};

function toMoneyString(value: number | string): string {
  const asNumber = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(asNumber)) {
    throw new KsefValidationError(`Invalid numeric value: ${String(value)}`);
  }
  return asNumber.toFixed(2);
}

function toNumber(value: number | string): number {
  const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(parsed)) {
    throw new KsefValidationError(`Invalid numeric value: ${String(value)}`);
  }
  return parsed;
}

function isZeroVatRate(value: number | string | null | undefined): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  return Math.abs(toNumber(value)) < 1e-12;
}

function normalizeParty(party: FA3Party): FA3Party {
  return {
    ...party,
    countryCode: party.countryCode ?? "PL",
  };
}

function mapParty(party: FA3Party): XmlObject {
  const normalized = normalizeParty(party);
  const countryCode = normalized.countryCode ?? "PL";
  return {
    DaneIdentyfikacyjne: {
      NIP: normalized.taxId,
      Nazwa: normalized.name,
    },
    Adres: {
      KodKraju: countryCode,
      ...(normalized.addressLine1 ? { AdresL1: normalized.addressLine1 } : {}),
      ...(normalized.addressLine2 ? { AdresL2: normalized.addressLine2 } : {}),
      ...(normalized.addressLine3 ? { AdresL3: normalized.addressLine3 } : {}),
    },
    ...(normalized.email || normalized.phone
      ? {
          DaneKontaktowe: {
            ...(normalized.email ? { Email: normalized.email } : {}),
            ...(normalized.phone ? { Telefon: normalized.phone } : {}),
          },
        }
      : {}),
  };
}

function mapLine(line: FA3Line, index: number): XmlObject {
  const quantity = toNumber(line.quantity);
  const unitNetPrice = toNumber(line.unitNetPrice);
  const computedNet = quantity * unitNetPrice;
  const vatRate = isZeroVatRate(line.vatRate) ? 0 : toNumber(line.vatRate as number | string);
  const vatAmount = vatRate === 0 ? 0 : (computedNet * vatRate) / 100;
  const grossAmount = computedNet + vatAmount;

  return {
    NrWierszaFa: String(index + 1),
    P_7: line.description,
    P_8A: line.unit,
    P_8B: String(line.quantity),
    P_9A: toMoneyString(line.unitNetPrice),
    P_11: toMoneyString(line.netAmount ?? computedNet),
    P_11Vat: toMoneyString(line.vatAmount ?? vatAmount),
    P_12: vatRate === 0 ? "0" : String(vatRate),
    P_12_XII: vatRate === 0 ? "true" : "false",
    P_14_5: toMoneyString(line.grossAmount ?? grossAmount),
  };
}

function mapKindSpecificFields(input: FA3DraftInput): XmlObject {
  const kind = input.kind ?? "basic";
  const kindCode = KIND_CODE[kind];
  const result: XmlObject = {
    RodzajFaktury: kindCode,
  };

  if (kind.includes("correction")) {
    if (input.correctionReason) {
      result.PrzyczynaKorekty = input.correctionReason;
    }
    if (input.correctedInvoiceNumber) {
      result.NrFaKorygowany = input.correctedInvoiceNumber;
    }
    if (input.correctedKsefNumber || input.correctedInvoiceDate) {
      result.DaneFaKorygowanej = {
        ...(input.correctedKsefNumber ? { NumerKSeF: input.correctedKsefNumber } : {}),
        ...(input.correctedInvoiceDate ? { DataWystawieniaFa: input.correctedInvoiceDate } : {}),
      };
    }
  }

  if (kind === "advance" || kind === "advance_correction") {
    if (input.advanceInvoiceNumber || input.advanceKsefNumber) {
      result.FakturaZaliczkowa = {
        ...(input.advanceInvoiceNumber ? { NrFakturyZaliczkowej: input.advanceInvoiceNumber } : {}),
        ...(input.advanceKsefNumber ? { NumerKSeF: input.advanceKsefNumber } : {}),
      };
    }
  }

  if (kind === "settlement" || kind === "settlement_correction") {
    if (input.settlementAmount !== undefined) {
      result.Rozliczenie = {
        KwotaRozliczana: toMoneyString(input.settlementAmount),
      };
    }
  }

  return result;
}

export class FA3Draft {
  private readonly value: FA3DraftInput;

  constructor(value: FA3DraftInput) {
    this.value = {
      ...value,
      kind: value.kind ?? "basic",
      currency: value.currency ?? "PLN",
      issuePlace: value.issuePlace ?? "",
    };
  }

  validate(): FA3ValidationIssue[] {
    const issues: FA3ValidationIssue[] = [];
    if (!this.value.invoiceNumber?.trim()) {
      issues.push({ code: "invoice_number_required", message: "invoiceNumber is required." });
    }
    if (!this.value.issueDate?.trim()) {
      issues.push({ code: "issue_date_required", message: "issueDate is required." });
    }
    if (!this.value.seller?.name || !this.value.seller?.taxId) {
      issues.push({ code: "seller_required", message: "seller.name and seller.taxId are required." });
    }
    if (!this.value.buyer?.name || !this.value.buyer?.taxId) {
      issues.push({ code: "buyer_required", message: "buyer.name and buyer.taxId are required." });
    }
    if (!Array.isArray(this.value.lines) || this.value.lines.length === 0) {
      issues.push({ code: "lines_required", message: "At least one invoice line is required." });
    }
    if (this.value.kind?.includes("correction")) {
      if (!this.value.correctedInvoiceNumber?.trim()) {
        issues.push({
          code: "corrected_invoice_number_required",
          message: "correctedInvoiceNumber is required for correction documents.",
        });
      }
      if (!this.value.correctionReason?.trim()) {
        issues.push({
          code: "correction_reason_required",
          message: "correctionReason is required for correction documents.",
        });
      }
    }
    return issues;
  }

  toDict(): FA3DraftInput {
    return {
      ...this.value,
      seller: { ...this.value.seller },
      buyer: { ...this.value.buyer },
      lines: this.value.lines.map((line) => ({ ...line })),
    };
  }

  static fromDict(value: FA3DraftInput): FA3Draft {
    return new FA3Draft(value);
  }

  toFakturaInput(): FakturaInput {
    const lines: XmlObject[] = this.value.lines.map((line, index) => mapLine(line, index));
    const totals = this.value.lines.reduce(
      (acc, line) => {
        const quantity = toNumber(line.quantity);
        const unitNetPrice = toNumber(line.unitNetPrice);
        const computedNet = quantity * unitNetPrice;
        const vatRate = isZeroVatRate(line.vatRate) ? 0 : toNumber(line.vatRate as string | number);
        const computedVat = vatRate === 0 ? 0 : (computedNet * vatRate) / 100;
        const net = toNumber(line.netAmount ?? computedNet);
        const vat = toNumber(line.vatAmount ?? computedVat);
        acc.net += net;
        acc.vat += vat;
        return acc;
      },
      { net: 0, vat: 0 },
    );
    const gross = totals.net + totals.vat;

    return {
      Naglowek: {
        KodFormularza: {
          systemCode: "FA (3)",
          schemaVersion: "1-0E",
          value: "FA",
        },
        WariantFormularza: "1",
        DataWytworzeniaFa: this.value.issueDate,
        SystemInfo: "ksef-client-typescript-fa3",
      },
      Podmiot1: mapParty(this.value.seller),
      Podmiot2: mapParty(this.value.buyer),
      Fa: {
        KodWaluty: this.value.currency ?? "PLN",
        P_1: this.value.issueDate.slice(0, 10),
        P_1M: this.value.issuePlace ?? "",
        P_2: this.value.invoiceNumber,
        P_13_1: toMoneyString(totals.net),
        P_14_1: toMoneyString(totals.vat),
        P_15: toMoneyString(gross),
        FaWiersz: lines,
        FaWiersze: {
          LiczbaWierszyFa: String(lines.length),
          WartoscWierszyFa: toMoneyString(gross),
        },
        ...mapKindSpecificFields(this.value),
      },
    };
  }

  async toXml(options: FA3XmlOptions = {}): Promise<string> {
    const issues = this.validate();
    if (issues.length > 0) {
      const message = issues.map((issue) => issue.message).join(" ");
      throw new KsefValidationError(message);
    }
    const xml = buildFakturaXml(this.toFakturaInput(), {
      schema: "FA3",
      ...(options.pretty !== undefined ? { pretty: options.pretty } : {}),
    });
    if (options.xsdValidate) {
      await validateFa3XmlXsd(xml);
    }
    return xml;
  }
}

export class FA3InvoiceBuilder {
  private readonly value: FA3DraftInput;

  constructor(invoiceNumber: string, kind: FA3InvoiceKind = "basic") {
    this.value = {
      invoiceNumber,
      issueDate: new Date().toISOString(),
      seller: { name: "", taxId: "" },
      buyer: { name: "", taxId: "" },
      lines: [],
      kind,
      currency: "PLN",
    };
  }

  issueDate(value: string): FA3InvoiceBuilder {
    this.value.issueDate = value;
    return this;
  }

  seller(value: FA3Party): FA3InvoiceBuilder {
    this.value.seller = { ...value };
    return this;
  }

  buyer(value: FA3Party): FA3InvoiceBuilder {
    this.value.buyer = { ...value };
    return this;
  }

  currency(value: string): FA3InvoiceBuilder {
    this.value.currency = value;
    return this;
  }

  issuePlace(value: string): FA3InvoiceBuilder {
    this.value.issuePlace = value;
    return this;
  }

  correction(value: {
    reason: string;
    correctedInvoiceNumber: string;
    correctedInvoiceDate?: string;
    correctedKsefNumber?: string;
  }): FA3InvoiceBuilder {
    this.value.correctionReason = value.reason;
    this.value.correctedInvoiceNumber = value.correctedInvoiceNumber;
    if (value.correctedInvoiceDate === undefined) {
      delete this.value.correctedInvoiceDate;
    } else {
      this.value.correctedInvoiceDate = value.correctedInvoiceDate;
    }
    if (value.correctedKsefNumber === undefined) {
      delete this.value.correctedKsefNumber;
    } else {
      this.value.correctedKsefNumber = value.correctedKsefNumber;
    }
    return this;
  }

  advanceReference(value: { invoiceNumber?: string; ksefNumber?: string }): FA3InvoiceBuilder {
    if (value.invoiceNumber === undefined) {
      delete this.value.advanceInvoiceNumber;
    } else {
      this.value.advanceInvoiceNumber = value.invoiceNumber;
    }
    if (value.ksefNumber === undefined) {
      delete this.value.advanceKsefNumber;
    } else {
      this.value.advanceKsefNumber = value.ksefNumber;
    }
    return this;
  }

  settlementAmount(value: number | string): FA3InvoiceBuilder {
    this.value.settlementAmount = value;
    return this;
  }

  addLine(value: FA3Line): FA3InvoiceBuilder {
    this.value.lines.push({ ...value });
    return this;
  }

  build(): FA3Draft {
    return new FA3Draft(this.value);
  }
}

export class FA3Invoice {
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
    return new FA3InvoiceBuilder(invoiceNumber, "advance_correction");
  }

  static settlementCorrection(invoiceNumber: string): FA3InvoiceBuilder {
    return new FA3InvoiceBuilder(invoiceNumber, "settlement_correction");
  }
}

export class FA3BatchDraft {
  readonly drafts: FA3Draft[];

  constructor(drafts: FA3Draft[]) {
    this.drafts = drafts;
  }

  toDict(): { drafts: FA3DraftInput[] } {
    return {
      drafts: this.drafts.map((draft) => draft.toDict()),
    };
  }

  toJson(): string {
    return JSON.stringify(this.toDict(), null, 2);
  }

  static fromJson(value: string): FA3BatchDraft {
    const parsed = JSON.parse(value) as { drafts?: FA3DraftInput[] };
    return new FA3BatchDraft((parsed.drafts ?? []).map((draft) => FA3Draft.fromDict(draft)));
  }

  async toXmlFiles(outDir: string, options: FA3XmlOptions = {}): Promise<string[]> {
    const output = path.resolve(outDir);
    await mkdir(output, { recursive: true });
    const files: string[] = [];
    for (let i = 0; i < this.drafts.length; i += 1) {
      const draft = this.drafts[i];
      if (!draft) {
        continue;
      }
      const xml = await draft.toXml(options);
      const invoiceNumber = draft.toDict().invoiceNumber || `invoice-${i + 1}`;
      const fileName = `${sanitizeFileName(invoiceNumber)}.xml`;
      const target = path.join(output, fileName);
      await writeFile(target, xml, "utf8");
      files.push(target);
    }
    return files;
  }

  async toXmlZip(targetPath: string, options: FA3XmlOptions = {}): Promise<string> {
    const entries = [];
    for (let i = 0; i < this.drafts.length; i += 1) {
      const draft = this.drafts[i];
      if (!draft) {
        continue;
      }
      const xml = await draft.toXml(options);
      const invoiceNumber = draft.toDict().invoiceNumber || `invoice-${i + 1}`;
      entries.push({
        fileName: `${sanitizeFileName(invoiceNumber)}.xml`,
        content: Buffer.from(xml, "utf8"),
      });
    }
    const zip = await createZip(entries);
    const resolved = path.resolve(targetPath);
    await mkdir(path.dirname(resolved), { recursive: true });
    await writeFile(resolved, zip);
    return resolved;
  }
}

function sanitizeFileName(value: string): string {
  const candidate = value.trim().replace(/[^A-Za-z0-9_.-]+/g, "_");
  return candidate || "faktura";
}
