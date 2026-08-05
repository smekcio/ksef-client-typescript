import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { createZip } from "../../utils/zip";
import { buildFakturaXml, FakturaInput } from "../../xml/invoice";
import { XmlObject } from "../../xml/xml";
import { KsefValidationError } from "../../errors/errors";
import { FA3_FORM_VARIANT } from "./enums";
import { validateFa3Xml } from "./xml";
import {
  FA3AdvancePayment,
  FA3BankAccount,
  FA3DraftInput,
  FA3InvoiceKind,
  FA3Line,
  FA3Party,
  FA3PaymentMethod,
  FA3PaymentDueDescription,
  FA3PaymentTerms,
  FA3Settlement,
  FA3ValidationIssue,
} from "./types";
import {
  mapPartyIdentityToXml,
  resolvePartyIdentifier,
  validatePartyIdentifier,
  validateSellerPartyIdentifier,
} from "./identifier";
import { TaxSummary, taxSummaryToFaFields } from "./tax";

interface FA3XmlOptions {
  pretty?: boolean;
  xsdValidate?: boolean;
}

type NormalizedFA3Draft = FA3DraftInput & {
  kind: FA3InvoiceKind;
  lines: FA3Line[];
  issuePlace: string;
  advancePayments: FA3AdvancePayment[];
  additionalParties: FA3Party[];
  rawExtensions: NonNullable<FA3DraftInput["rawExtensions"]>;
  additionalDescriptions: NonNullable<FA3DraftInput["additionalDescriptions"]>;
};

const KIND_CODE: Record<FA3InvoiceKind, string> = {
  basic: "VAT",
  simplified: "UPR",
  correction: "KOR",
  advance: "ZAL",
  settlement: "ROZ",
  advance_correction: "KOR_ZAL",
  settlement_correction: "KOR_ROZ",
};

const CORRECTION_KINDS = new Set<FA3InvoiceKind>([
  "correction",
  "advance_correction",
  "settlement_correction",
]);

const SETTLEMENT_KINDS = new Set<FA3InvoiceKind>(["settlement", "settlement_correction"]);

const CORRECTION_TYPE_TO_CODE: Record<string, string> = {
  "1": "1",
  "2": "2",
  "3": "3",
  tax_base_or_tax: "1",
  other: "2",
  no_tax_impact: "3",
};

const PAYMENT_METHOD_TO_CODE: Record<string, string> = {
  "1": "1",
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
  "6": "6",
  "7": "7",
  cash: "1",
  card: "2",
  voucher: "3",
  check: "4",
  credit: "5",
  transfer: "6",
  compensation: "7",
  mobile: "2",
  other: "7",
};

const THIRD_PARTY_ROLE_TO_CODE: Record<string, string> = {
  "1": "1",
  "2": "2",
  "3": "3",
  "4": "4",
  "8": "8",
  "10": "10",
  "11": "11",
  original_entity: "1",
  additional_buyer: "2",
  recipient: "3",
  payer: "4",
  jst_subunit: "8",
  vat_group_member: "10",
  other: "11",
};

const TRANSPORT_KIND_TO_CODE: Record<string, string> = {
  "1": "1",
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
  "7": "7",
  "8": "8",
  sea: "1",
  rail: "2",
  road: "3",
  air: "4",
  postal: "5",
  fixed_transport: "7",
  other: "8",
};

function toNumber(value: number | string): number {
  const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(parsed)) {
    throw new KsefValidationError(`Invalid numeric value: ${String(value)}`);
  }
  return parsed;
}

function money(value: number | string): string {
  return toNumber(value).toFixed(2);
}

function percentage(value: number | string): string {
  const numeric = toNumber(value);
  if (Number.isInteger(numeric)) {
    return String(numeric);
  }
  return String(numeric);
}

function mapXiiVatRate(value: number | string | null | undefined): string | undefined {
  if (value === null || value === undefined || isZeroVat(value)) {
    return undefined;
  }
  return percentage(value);
}

function toDateOnly(value: string): string {
  return value.includes("T") ? value.slice(0, 10) : value;
}

function isZeroVat(value: number | string | null | undefined): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  return Math.abs(toNumber(value)) < 1e-12;
}

function normalizeCurrency(value: string | undefined): string {
  return (value ?? "PLN").trim().toUpperCase();
}

function normalizePaymentMethod(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  return PAYMENT_METHOD_TO_CODE[value] ?? value;
}

function mapParty(party: FA3Party, context: "seller" | "buyer" = "buyer"): XmlObject {
  const identifier = resolvePartyIdentifier(party);
  return {
    ...(party.eori ? { NrEORI: party.eori } : {}),
    DaneIdentyfikacyjne: mapPartyIdentityToXml(identifier, party.name, context),
    ...((party.countryCode ?? "PL") && party.addressLine1
      ? {
          Adres: {
            KodKraju: party.countryCode ?? "PL",
            AdresL1: party.addressLine1,
            ...(party.addressLine2 ? { AdresL2: party.addressLine2 } : {}),
            ...(party.addressLine3 ? { AdresL3: party.addressLine3 } : {}),
          },
        }
      : {}),
    ...(party.email || party.phone
      ? {
          DaneKontaktowe: {
            ...(party.email ? { Email: party.email } : {}),
            ...(party.phone ? { Telefon: party.phone } : {}),
          },
        }
      : {}),
  };
}

function mapBuyer(party: FA3Party): XmlObject {
  return {
    ...mapParty(party, "buyer"),
    JST: party.isJstSubunit ? "1" : "2",
    GV: party.isVatGroupMember ? "1" : "2",
  };
}

function mapAdditionalParty(party: FA3Party): XmlObject {
  const roleCode = party.role ? THIRD_PARTY_ROLE_TO_CODE[party.role] ?? party.role : "2";
  const role: XmlObject =
    roleCode === "11" || party.role === "other"
      ? { RolaInna: "1", ...(party.otherRoleDescription ? { OpisRoli: party.otherRoleDescription } : {}) }
      : { Rola: roleCode };
  return {
    ...(party.buyerId ? { IDNabywcy: party.buyerId } : {}),
    ...mapParty(party, "buyer"),
    ...role,
    ...(party.share !== undefined ? { Udzial: String(party.share) } : {}),
    ...(party.customerNumber ? { NrKlienta: party.customerNumber } : {}),
  };
}

function computeLineAmounts(line: FA3Line): {
  net: number;
  vat: number;
  gross: number;
  vatRate: number;
} {
  const quantity = toNumber(line.quantity);
  const unitNetPrice = toNumber(line.unitNetPrice);
  const baseNet = quantity * unitNetPrice;
  const vatRate = isZeroVat(line.vatRate) ? 0 : toNumber(line.vatRate as number | string);
  const vat = vatRate === 0 ? 0 : (baseNet * vatRate) / 100;
  const gross = baseNet + vat;
  return {
    net: toNumber(line.netAmount ?? baseNet),
    vat: toNumber(line.vatAmount ?? vat),
    gross: toNumber(line.grossAmount ?? gross),
    vatRate,
  };
}

function mapLine(line: FA3Line, index: number): XmlObject {
  const amounts = computeLineAmounts(line);
  const vatRateText = line.vatCode?.trim()
    ? line.vatCode.trim()
    : amounts.vatRate === 0
      ? "0"
      : String(amounts.vatRate);
  const xiiVatRate = mapXiiVatRate(line.xiiVatRate);
  return {
    NrWierszaFa: String(index + 1),
    P_7: line.description,
    P_8A: line.unit,
    P_8B: String(line.quantity),
    P_9A: money(line.unitNetPrice),
    P_11: money(amounts.net),
    P_11Vat: money(amounts.vat),
    P_12: vatRateText,
    ...(xiiVatRate ? { P_12_XII: xiiVatRate } : {}),
    ...(line.annex15 ? { P_12_Zal_15: "1" } : {}),
    ...(line.serviceDate ? { P_6A: toDateOnly(line.serviceDate) } : {}),
    ...(line.beforeCorrection ? { StanPrzed: "1" } : {}),
    ...(line.uniqueId ? { UU_ID: line.uniqueId } : {}),
    ...(line.gtu ? { GTU: line.gtu } : {}),
    ...(line.procedure ? { Procedura: line.procedure } : {}),
  };
}

type AdvanceSplit = {
  net: number;
  vat: number;
  gross: number;
  vatRate: number;
  vatCode: string;
};

function splitAdvancePayment(payment: FA3AdvancePayment): AdvanceSplit {
  const gross = toNumber(payment.amount);
  const vatRate = isZeroVat(payment.vatRate) ? null : toNumber(payment.vatRate as number | string);
  if (vatRate === null) {
    return { net: gross, vat: 0, gross, vatRate: 0, vatCode: "0 KR" };
  }
  const divisor = 1 + vatRate / 100;
  const net = gross / divisor;
  const vat = gross - net;
  return { net, vat, gross, vatRate, vatCode: String(vatRate) };
}

function computeAdvanceNetVat(payments: FA3AdvancePayment[]): { net: number; vat: number; gross: number } {
  return payments.reduce(
    (acc, payment) => {
      const split = splitAdvancePayment(payment);
      acc.net += split.net;
      acc.vat += split.vat;
      acc.gross += split.gross;
      return acc;
    },
    { net: 0, vat: 0, gross: 0 },
  );
}

/** Synthetic FA lines so advancePayments contribute to P_13_x/P_14_x buckets (not FaWiersz). */
function advancePaymentsAsLines(payments: FA3AdvancePayment[]): FA3Line[] {
  return payments.map((payment) => {
    const split = splitAdvancePayment(payment);
    return {
      description: "Zaliczka",
      quantity: 1,
      unit: "szt",
      unitNetPrice: split.net,
      vatRate: split.vatRate,
      vatCode: split.vatCode,
      netAmount: split.net,
      vatAmount: split.vat,
      grossAmount: split.gross,
    };
  });
}

function extractTotals(input: NormalizedFA3Draft): { net: number; vat: number; gross: number } {
  const linesTotals = input.lines.reduce(
    (acc, line) => {
      const amounts = computeLineAmounts(line);
      const sign = CORRECTION_KINDS.has(input.kind) && line.beforeCorrection ? -1 : 1;
      acc.net += sign * amounts.net;
      acc.vat += sign * amounts.vat;
      acc.gross += sign * amounts.gross;
      return acc;
    },
    { net: 0, vat: 0, gross: 0 },
  );
  const advanceTotals = computeAdvanceNetVat(input.advancePayments);
  return {
    net: linesTotals.net + advanceTotals.net,
    vat: linesTotals.vat + advanceTotals.vat,
    gross: linesTotals.gross + advanceTotals.gross,
  };
}

function mapAdnotacje(input: NormalizedFA3Draft): XmlObject {
  const hasAnnex15Line = input.lines.some((line) => line.annex15);
  const gross = extractTotals(input).gross;
  const splitPaymentRequested = input.splitPaymentAnnotation === true;

  const p18a =
    splitPaymentRequested || (hasAnnex15Line && gross > 15000) ? "1" : "2";

  return {
    Adnotacje: {
      P_16: "2",
      P_17: "2",
      P_18: "2",
      P_18A: p18a,
      Zwolnienie: { P_19N: "1" },
      NoweSrodkiTransportu: { P_22N: "1" },
      P_23: "2",
      PMarzy: { P_PMarzyN: "1" },
    },
  };
}

function mapDaneFaKorygowanej(input: NormalizedFA3Draft): XmlObject | undefined {
  const correctedDate = input.correctedInvoiceDate?.trim();
  const correctedNumber = input.correctedInvoiceNumber?.trim();
  if (!correctedDate || !correctedNumber) {
    return undefined;
  }

  const dane: XmlObject = {
    DataWystFaKorygowanej: correctedDate,
    NrFaKorygowanej: correctedNumber,
  };

  const correctedKsefNumber = input.correctedKsefNumber?.trim();
  if (correctedKsefNumber) {
    dane.NrKSeF = "1";
    dane.NrKSeFFaKorygowanej = correctedKsefNumber;
  } else {
    dane.NrKSeFN = "1";
  }

  return dane;
}

function mapKindSpecificFields(input: NormalizedFA3Draft): XmlObject {
  const kind = input.kind;
  const payload: XmlObject = { RodzajFaktury: KIND_CODE[kind] };

  if (CORRECTION_KINDS.has(kind)) {
    if (input.correctionType) {
      payload.TypKorekty = CORRECTION_TYPE_TO_CODE[input.correctionType] ?? input.correctionType;
    }
    if (input.correctionReason) {
      payload.PrzyczynaKorekty = input.correctionReason;
    }
    if (input.correctedPeriod) {
      payload.OkresFaKorygowanej = input.correctedPeriod;
    }
    if (input.correctedInvoiceNumberOverride) {
      payload.NrFaKorygowany = input.correctedInvoiceNumberOverride;
    }
    const dane = mapDaneFaKorygowanej(input);
    if (dane) {
      payload.DaneFaKorygowanej = dane;
    }
  }

  if (
    kind === "advance" ||
    kind === "advance_correction" ||
    kind === "settlement" ||
    kind === "settlement_correction"
  ) {
    if (input.advanceInvoiceNumber || input.advanceKsefNumber) {
      payload.FakturaZaliczkowa = {
        ...(input.advanceInvoiceNumber ? { NrFakturyZaliczkowej: input.advanceInvoiceNumber } : {}),
        ...(input.advanceKsefNumber ? { NrKSeFFaZaliczkowej: input.advanceKsefNumber } : {}),
      };
    }
  }

  if (kind === "advance" || kind === "advance_correction") {
    if (input.advancePayments.length > 0) {
      payload.ZaliczkaCzesciowa = input.advancePayments.map((payment) => ({
        P_15Z: money(payment.amount),
        ...(payment.currencyRate !== undefined ? { KursWalutyZW: String(payment.currencyRate) } : {}),
      }));
    }
    if (input.foreignCurrencyRate !== undefined) {
      payload.KursWalutyZ = String(input.foreignCurrencyRate);
    }
  }

  return payload;
}

function validateBusinessRules(input: NormalizedFA3Draft): FA3ValidationIssue[] {
  const issues: FA3ValidationIssue[] = [];
  const kind = input.kind;
  const currency = normalizeCurrency(input.currency);
  const lines = input.lines;

  if (!input.invoiceNumber?.trim()) {
    issues.push({ code: "invoice_number_required", path: "invoice.invoiceNumber", message: "Numer faktury jest wymagany." });
  }
  if (!input.issueDate?.trim()) {
    issues.push({ code: "issue_date_required", path: "invoice.issueDate", message: "Data wystawienia jest wymagana." });
  }
  if (!input.seller?.name?.trim() || !input.seller?.taxId?.trim()) {
    issues.push({ code: "seller_required", path: "invoice.seller", message: "Dane sprzedawcy są wymagane." });
  } else if (input.seller) {
    issues.push(
      ...validateSellerPartyIdentifier(
        resolvePartyIdentifier(input.seller),
        "invoice.seller",
      ),
    );
  }
  if (!input.buyer?.name?.trim() || !input.buyer?.taxId?.trim()) {
    issues.push({ code: "buyer_required", path: "invoice.buyer", message: "Dane nabywcy są wymagane." });
  } else if (input.buyer) {
    issues.push(
      ...validatePartyIdentifier(resolvePartyIdentifier(input.buyer), "invoice.buyer"),
    );
  }
  if (lines.length === 0 && kind !== "advance" && kind !== "advance_correction") {
    issues.push({
      code: "lines_required",
      path: "invoice.lines",
      message: "Faktura wymaga co najmniej jednej pozycji.",
    });
  }

  if (CORRECTION_KINDS.has(kind)) {
    if (!input.correctionReason?.trim()) {
      issues.push({
        code: "correction_reason_required",
        path: "invoice.correctionReason",
        message: "Przyczyna korekty jest wymagana.",
      });
    }
    if (!input.correctedInvoiceNumber?.trim()) {
      issues.push({
        code: "corrected_invoice_number_required",
        path: "invoice.correctedInvoiceNumber",
        message: "Numer faktury korygowanej jest wymagany.",
      });
    }
    if (!input.correctedInvoiceDate?.trim()) {
      issues.push({
        code: "corrected_invoice_date_required",
        path: "invoice.correctedInvoiceDate",
        message: "Data faktury korygowanej jest wymagana.",
      });
    }
  }

  if (SETTLEMENT_KINDS.has(kind)) {
    if (!input.advanceInvoiceNumber && !input.advanceKsefNumber) {
      issues.push({
        code: "advance_reference_required",
        path: "invoice.advanceInvoice",
        message: "Podaj numer faktury zaliczkowej albo numer KSeF.",
      });
    }
  }

  if (input.advanceInvoiceNumber && input.advanceKsefNumber) {
    issues.push({
      code: "advance_reference_conflict",
      path: "invoice.advanceInvoice",
      message: "Podaj numer faktury zaliczkowej albo numer KSeF, nie oba.",
    });
  }

  if (input.saleDate && (input.periodFrom || input.periodTo)) {
    issues.push({
      code: "sale_date_period_conflict",
      path: "invoice.saleDate",
      message: "Podaj date sprzedaży albo okres faktury, nie oba.",
    });
  }
  if ((input.periodFrom && !input.periodTo) || (!input.periodFrom && input.periodTo)) {
    issues.push({
      code: "half_period",
      path: "invoice.period",
      message: "Okres faktury wymaga obu dat: od i do.",
    });
  }

  const payment = input.paymentTerms;
  if (payment?.paidDate && (payment.partialPayments?.length ?? 0) > 0) {
    issues.push({
      code: "payment_paid_vs_partial_conflict",
      path: "invoice.paymentTerms",
      message: "Podaj date zapłaty albo płatności częściowe, nie oba.",
    });
  }
  if (payment?.method && payment.otherMethodDescription) {
    issues.push({
      code: "payment_method_other_conflict",
      path: "invoice.paymentTerms",
      message: "Podaj forme płatności albo opis innej formy, nie oba.",
    });
  }
  for (const [index, partial] of (payment?.partialPayments ?? []).entries()) {
    if (partial.method && partial.otherMethodDescription) {
      issues.push({
        code: "partial_payment_method_other_conflict",
        path: `invoice.paymentTerms.partialPayments[${index + 1}]`,
        message: "Podaj forme płatności albo opis innej formy, nie oba.",
      });
    }
  }

  const settlement = input.settlement;
  if (settlement?.amountDue !== undefined && settlement.amountToSettle !== undefined) {
    issues.push({
      code: "settlement_choice_conflict",
      path: "invoice.settlement",
      message: "Podaj DoZaplaty albo DoRozliczenia, nie oba.",
    });
  }
  if (settlement?.amountDue !== undefined) {
    const totals = extractTotals(input);
    const charges = (settlement.charges ?? []).reduce((sum, row) => sum + toNumber(row.amount), 0);
    const deductions = (settlement.deductions ?? []).reduce((sum, row) => sum + toNumber(row.amount), 0);
    const expectedDue = toNumber((totals.gross + charges - deductions).toFixed(2));
    const providedDue = toNumber(settlement.amountDue);
    if (Math.abs(expectedDue - providedDue) > 0.009) {
      issues.push({
        code: "settlement_amount_due_inconsistent",
        path: "invoice.settlement.amountDue",
        message:
          `Rozliczenie niespójne; oczekiwane DoZaplaty=${money(expectedDue)} ` +
          `(P_15 + SumaObciazen - SumaOdliczen), otrzymano ${money(providedDue)}.`,
      });
    }
  }

  if (input.rawExtensions.length > 0) {
    issues.push({
      code: "raw_extension_unsupported",
      path: "invoice.rawExtensions",
      message: "Raw XML extension nie jest wspierany w typed FA(3) SDK.",
    });
  }

  if (input.simplifiedReceiptLike) {
    const gross = extractTotals(input).gross;
    if (currency !== "PLN") {
      issues.push({
        code: "simplified_receipt_currency",
        path: "invoice.currency",
        message: "Faktura uproszczona paragonowa z limitem 450 PLN wymaga waluty PLN.",
      });
    }
    if (gross > 450.0 + 1e-9) {
      issues.push({
        code: "simplified_receipt_limit",
        path: "invoice.totalGross",
        message: "Faktura uproszczona paragonowa nie może przekroczyć 450 PLN.",
      });
    }
  }

  for (const [index, party] of input.additionalParties.entries()) {
    const partyPath = `invoice.additionalParties[${index + 1}]`;
    if (party.role === "other" && !party.otherRoleDescription?.trim()) {
      issues.push({
        code: "third_party_other_description_required",
        path: partyPath,
        message: "otherRoleDescription jest wymagany dla roli 'other'.",
      });
    }
    issues.push(...validatePartyIdentifier(resolvePartyIdentifier(party), partyPath));
  }

  if (input.buyer?.isJstSubunit) {
    const hasJst = input.additionalParties.some((party) => party.role === "jst_subunit");
    if (!hasJst) {
      issues.push({
        code: "jst_subunit_missing_party3",
        path: "invoice.additionalParties",
        message: "JST wymaga podmiotu dodatkowego z rolą jst_subunit.",
      });
    }
  }

  if (input.buyer?.isVatGroupMember) {
    const hasGv = input.additionalParties.some((party) => party.role === "vat_group_member");
    if (!hasGv) {
      issues.push({
        code: "vat_group_missing_party3",
        path: "invoice.additionalParties",
        message: "GV wymaga podmiotu dodatkowego z rolą vat_group_member.",
      });
    }
  }

  return issues;
}

function mapBankAccount(account: FA3BankAccount): XmlObject {
  return {
    NrRB: account.number,
    ...(account.swift ? { SWIFT: account.swift } : {}),
    ...(account.ownBankAccountType ? { RachunekWlasnyBanku: account.ownBankAccountType } : {}),
    ...(account.bankName ? { NazwaBanku: account.bankName } : {}),
    ...(account.description ? { OpisRachunku: account.description } : {}),
  };
}

function parseDueDescription(value: string): FA3PaymentDueDescription | undefined {
  const match = /^(\d+(?:[.,]\d+)?)\s+(.+?)\s+od\s+(.+)$/i.exec(value.trim());
  if (!match?.[1] || !match[2] || !match[3]) {
    return undefined;
  }
  return {
    amount: match[1],
    unit: match[2],
    startsFrom: match[3],
  };
}

function mapDueDescription(value: FA3PaymentDueDescription): XmlObject {
  return {
    Ilosc: String(value.amount),
    Jednostka: value.unit,
    ZdarzeniePoczatkowe: value.startsFrom,
  };
}

function mapPaymentChoice(method?: string, otherMethodDescription?: string): XmlObject {
  const normalized = normalizePaymentMethod(method);
  if (normalized && normalized !== "7") {
    return { FormaPlatnosci: normalized };
  }
  if (otherMethodDescription) {
    return {
      PlatnoscInna: "1",
      OpisPlatnosci: otherMethodDescription,
    };
  }
  return normalized ? { FormaPlatnosci: normalized } : {};
}

function mapPaymentTerms(paymentTerms?: FA3PaymentTerms): XmlObject | undefined {
  if (!paymentTerms) {
    return undefined;
  }
  const dueDescription = paymentTerms.dueDescriptionParts ?? (
    paymentTerms.dueDescription ? parseDueDescription(paymentTerms.dueDescription) : undefined
  );
  const partialPayments = paymentTerms.partialPayments ?? [];
  const bankAccounts = paymentTerms.bankAccounts ?? [];
  const factorBankAccounts = paymentTerms.factorBankAccounts ?? [];
  return {
    ...(paymentTerms.paidDate ? { Zaplacono: "1", DataZaplaty: paymentTerms.paidDate } : {}),
    ...(partialPayments.length > 0
      ? {
          ZnacznikZaplatyCzesciowej: "1",
          ZaplataCzesciowa: partialPayments.map((partial) => ({
            KwotaZaplatyCzesciowej: money(partial.amount),
            DataZaplatyCzesciowej: partial.paidOn,
            ...mapPaymentChoice(partial.method, partial.otherMethodDescription),
          })),
        }
      : {}),
    ...(paymentTerms.dueDate || dueDescription
      ? {
          TerminPlatnosci: {
            ...(paymentTerms.dueDate ? { Termin: paymentTerms.dueDate } : {}),
            ...(dueDescription ? { TerminOpis: mapDueDescription(dueDescription) } : {}),
          },
        }
      : {}),
    ...mapPaymentChoice(paymentTerms.method, paymentTerms.otherMethodDescription),
    ...(bankAccounts.length > 0
      ? { RachunekBankowy: bankAccounts.map(mapBankAccount) }
      : {}),
    ...(factorBankAccounts.length > 0
      ? { RachunekBankowyFaktora: factorBankAccounts.map(mapBankAccount) }
      : {}),
    ...(paymentTerms.paymentLink ? { LinkDoPlatnosci: paymentTerms.paymentLink } : {}),
    ...(paymentTerms.ipksef ? { IPKSeF: paymentTerms.ipksef } : {}),
  };
}

function mapSettlement(input: NormalizedFA3Draft): XmlObject | undefined {
  const settlement = input.settlement;
  if (!settlement && input.settlementAmount === undefined) {
    return undefined;
  }
  const charges = settlement?.charges ?? [];
  const deductions = settlement?.deductions ?? [];
  return {
    ...(charges.length > 0
      ? {
          Obciazenia: charges.map((row) => ({
            Kwota: money(row.amount),
            Powod: row.reason,
          })),
          SumaObciazen: money(charges.reduce((sum, row) => sum + toNumber(row.amount), 0)),
        }
      : {}),
    ...(deductions.length > 0
      ? {
          Odliczenia: deductions.map((row) => ({
            Kwota: money(row.amount),
            Powod: row.reason,
          })),
          SumaOdliczen: money(deductions.reduce((sum, row) => sum + toNumber(row.amount), 0)),
        }
      : {}),
    ...(settlement?.amountDue !== undefined
      ? { DoZaplaty: money(settlement.amountDue) }
      : {}),
    ...(settlement?.amountToSettle !== undefined
      ? { DoRozliczenia: money(settlement.amountToSettle) }
      : {}),
    ...(input.settlementAmount !== undefined ? { DoZaplaty: money(input.settlementAmount) } : {}),
  };
}

function mapOrder(input: NormalizedFA3Draft): XmlObject | undefined {
  const order = input.order;
  const orderLines = order?.lines ?? [];
  if (!order || order.totalGross === undefined || orderLines.length === 0) {
    return undefined;
  }
  return {
    WartoscZamowienia: money(order.totalGross),
    ZamowienieWiersz: orderLines.map((line, index) => {
      const net = toNumber(line.quantity) * toNumber(line.unitNetPrice);
      const vatRate = isZeroVat(line.vatRate) ? 0 : toNumber(line.vatRate as number | string);
      const vat = vatRate === 0 ? 0 : (net * vatRate) / 100;
      const xiiVatRate = mapXiiVatRate(line.xiiVatRate);
      return {
        NrWierszaZam: String(index + 1),
        P_7Z: line.description,
        P_8AZ: "szt",
        P_8BZ: String(line.quantity),
        P_9AZ: money(line.unitNetPrice),
        P_11NettoZ: money(net),
        P_11VatZ: money(vat),
        ...(line.vatRate !== undefined ? { P_12Z: String(line.vatRate) } : {}),
        ...(xiiVatRate ? { P_12Z_XII: xiiVatRate } : {}),
      };
    }),
  };
}

function mapTransport(input: NormalizedFA3Draft): XmlObject | undefined {
  const transport = input.transport;
  if (!transport) {
    return undefined;
  }
  const kind = TRANSPORT_KIND_TO_CODE[transport.kind] ?? transport.kind;
  return {
    ...(kind === "8"
      ? { TransportInny: "1", OpisInnegoTransportu: transport.kind }
      : { RodzajTransportu: kind }),
    ...(transport.orderNumber ? { NrZleceniaTransportu: transport.orderNumber } : {}),
    ...(transport.cargoDescription ? { OpisLadunku: transport.cargoDescription } : {}),
    ...(transport.packageUnit ? { JednostkaOpakowania: transport.packageUnit } : {}),
  };
}

export class FA3Draft {
  private readonly value: NormalizedFA3Draft;

  constructor(value: FA3DraftInput) {
    this.value = {
      ...value,
      kind: value.kind ?? "basic",
      currency: normalizeCurrency(value.currency),
      issuePlace: value.issuePlace ?? "",
      lines: value.lines.map((line) => ({ ...line })),
      advancePayments: (value.advancePayments ?? []).map((row) => ({ ...row })),
      additionalParties: (value.additionalParties ?? []).map((row) => ({ ...row })),
      rawExtensions: (value.rawExtensions ?? []).map((row) => ({ ...row })),
      additionalDescriptions: (value.additionalDescriptions ?? []).map((row) => ({ ...row })),
      ...(value.contract ? { contract: { ...value.contract } } : {}),
      ...(value.order
        ? {
            order: {
              ...value.order,
              ...(value.order.lines ? { lines: value.order.lines.map((line) => ({ ...line })) } : {}),
            },
          }
        : {}),
      ...(value.transport ? { transport: { ...value.transport } } : {}),
      ...(value.transactionTerms ? { transactionTerms: { ...value.transactionTerms } } : {}),
      ...(value.attachment
        ? {
            attachment: {
              blocks: value.attachment.blocks.map((block) => ({
                ...block,
                ...(block.paragraphs ? { paragraphs: [...block.paragraphs] } : {}),
                ...(block.tables
                  ? {
                      tables: block.tables.map((table) => ({
                        ...table,
                        headers: [...table.headers],
                        rows: table.rows.map((row) => [...row]),
                      })),
                    }
                  : {}),
              })),
            },
          }
        : {}),
    };
  }

  static fromDict(value: FA3DraftInput | (FA3DraftInput & Record<string, unknown>)): FA3Draft {
    const source = value as Record<string, unknown>;
    const normalized: FA3DraftInput = {
      ...value,
      invoiceNumber: String(value.invoiceNumber ?? source["invoice_number"] ?? ""),
      issueDate: String(value.issueDate ?? source["issue_date"] ?? ""),
      currency: normalizeCurrency(String(value.currency ?? source["waluta"] ?? "PLN")),
      seller: (value.seller ?? {}) as FA3Party,
      buyer: (value.buyer ?? {}) as FA3Party,
      lines: (value.lines ?? []) as FA3Line[],
    };
    return new FA3Draft(normalized);
  }

  toDict(): FA3DraftInput {
    return JSON.parse(JSON.stringify(this.value)) as FA3DraftInput;
  }

  validate(): FA3ValidationIssue[] {
    return validateBusinessRules(this.value);
  }

  toFakturaInput(): FakturaInput {
    const kind = this.value.kind;
    const lines = this.value.lines.map((line, index) => mapLine(line, index));
    const totals = extractTotals(this.value);
    const currency = normalizeCurrency(this.value.currency);
    const includeVatPln =
      currency !== "PLN" && this.value.lines.some((line) => line.vatAmountPln != null && line.vatAmountPln !== "");
    const taxFields = taxSummaryToFaFields(
      TaxSummary.fromLines(
        [...this.value.lines, ...advancePaymentsAsLines(this.value.advancePayments)],
        {
          treatBeforeCorrectionAsNegative: CORRECTION_KINDS.has(kind),
        },
      ),
      { includeVatPln },
    );
    const faPayload: XmlObject = {
      KodWaluty: currency,
      P_1: toDateOnly(this.value.issueDate),
      ...(this.value.issuePlace?.trim() ? { P_1M: this.value.issuePlace.trim() } : {}),
      P_2: this.value.invoiceNumber,
      ...taxFields,
      P_15: money(totals.gross),
      ...mapAdnotacje(this.value),
      FaWiersz: lines,
      ...mapKindSpecificFields(this.value),
    };

    const payment = mapPaymentTerms(this.value.paymentTerms);
    if (payment) {
      faPayload.Platnosc = payment;
    }

    if (this.value.saleDate) {
      faPayload.P_6 = toDateOnly(this.value.saleDate);
    }
    if (this.value.periodFrom && this.value.periodTo) {
      faPayload.OkresFa = {
        P_6_Od: toDateOnly(this.value.periodFrom),
        P_6_Do: toDateOnly(this.value.periodTo),
      };
    }
    if (this.value.attachmentText) {
      faPayload.Zalacznik = {
        Opis: this.value.attachmentText,
      };
    }
    if (this.value.additionalDescriptions.length > 0) {
      faPayload.DodatkowyOpis = this.value.additionalDescriptions.map((item) => ({
        Klucz: item.key,
        Wartosc: item.value,
      }));
    }
    if (this.value.transactionTerms || this.value.contract || this.value.order?.number || this.value.order?.date) {
      const transactionTerms: XmlObject = {
        ...(this.value.contract
          ? {
              Umowy: [{
                ...(this.value.contract.date ? { DataUmowy: this.value.contract.date } : {}),
                NrUmowy: this.value.contract.number,
              }],
            }
          : {}),
        ...(this.value.order?.number || this.value.order?.date
          ? {
              Zamowienia: [{
                ...(this.value.order.date ? { DataZamowienia: this.value.order.date } : {}),
                ...(this.value.order.number ? { NrZamowienia: this.value.order.number } : {}),
              }],
            }
          : {}),
        ...(this.value.transactionTerms?.deliveryTerms
          ? { WarunkiDostawy: this.value.transactionTerms.deliveryTerms }
          : {}),
        ...(this.value.transactionTerms?.contractualRate
          ? { KursUmowny: this.value.transactionTerms.contractualRate }
          : {}),
        ...(this.value.transactionTerms?.contractualCurrency
          ? { WalutaUmowna: this.value.transactionTerms.contractualCurrency }
          : {}),
        ...(this.value.transactionTerms?.intermediary !== undefined
          ? { Posrednik: this.value.transactionTerms.intermediary ? "1" : "0" }
          : {}),
      };
      faPayload.WarunkiTransakcji = transactionTerms;
    }
    const transport = mapTransport(this.value);
    if (transport) {
      faPayload.Transport = transport;
    }
    const order = mapOrder(this.value);
    if (order) {
      faPayload.Zamowienie = order;
    }
    if (this.value.attachment && this.value.attachment.blocks.length > 0) {
      faPayload.Zalacznik = {
        Blok: this.value.attachment.blocks.map((block) => {
          const blockTables = block.tables ?? [];
          return {
            ...(block.header ? { Naglowek: block.header } : {}),
            ...(block.paragraphs ? { Akapit: [...block.paragraphs] } : {}),
            ...(blockTables.length > 0
              ? {
                  Tabela: blockTables.map((table) => ({
                    Naglowki: table.headers,
                    Wiersze: table.rows,
                  })),
                }
              : {}),
          };
        }),
      };
    }
    if (kind === "advance" || kind === "advance_correction") {
      if (this.value.advancePayments.length > 0) {
        faPayload.ZaliczkaCzesciowa = this.value.advancePayments.map((row) => ({
          P_15Z: money(row.amount),
          ...(row.currencyRate !== undefined ? { KursWalutyZW: String(row.currencyRate) } : {}),
        }));
      }
    }
    if (kind === "settlement" || kind === "settlement_correction") {
      const settlement = mapSettlement(this.value);
      if (settlement) {
        faPayload.Rozliczenie = settlement;
      }
    }

    const root: FakturaInput = {
      Naglowek: {
        KodFormularza: {
          systemCode: "FA (3)",
          schemaVersion: "1-0E",
          value: "FA",
        },
        WariantFormularza: FA3_FORM_VARIANT,
        DataWytworzeniaFa: this.value.issueDate,
        SystemInfo: "ksef-client-typescript-fa3",
      },
      Podmiot1: mapParty(this.value.seller, "seller"),
      Podmiot2: mapBuyer(this.value.buyer),
      Fa: faPayload,
    };
    if (this.value.additionalParties.length > 0) {
      root.Podmiot3 = this.value.additionalParties.map(mapAdditionalParty);
    }
    return {
      ...root,
    };
  }

  async toXml(options: FA3XmlOptions = {}): Promise<string> {
    const issues = this.validate();
    if (issues.length > 0) {
      const detail = issues.map((issue) => issue.message).join(" ");
      throw new KsefValidationError(detail);
    }
    const xml = buildFakturaXml(this.toFakturaInput(), {
      schema: "FA3",
      ...(options.pretty !== undefined ? { pretty: options.pretty } : {}),
    });
    return options.xsdValidate ? validateAndReturnXml(xml) : xml;
  }
}

export async function validateAndReturnXml(
  xml: string,
  validate: (value: string) => Promise<void> = validateFa3Xml,
): Promise<string> {
  await validate(xml);
  return xml;
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

  issuedOn(value: Date): FA3InvoiceBuilder {
    this.value.issueDate = value.toISOString();
    return this;
  }

  issueDate(value: string): FA3InvoiceBuilder {
    this.value.issueDate = value;
    return this;
  }

  saleDate(value: string): FA3InvoiceBuilder {
    this.value.saleDate = value;
    return this;
  }

  period(from: string, to: string): FA3InvoiceBuilder {
    this.value.periodFrom = from;
    this.value.periodTo = to;
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

  addParty(value: FA3Party): FA3InvoiceBuilder {
    this.value.additionalParties = [...(this.value.additionalParties ?? []), { ...value }];
    return this;
  }

  currency(value: string): FA3InvoiceBuilder {
    this.value.currency = normalizeCurrency(value);
    return this;
  }

  issuePlace(value: string): FA3InvoiceBuilder {
    this.value.issuePlace = value;
    return this;
  }

  additionalDescription(key: string, value: string): FA3InvoiceBuilder {
    this.value.additionalDescriptions = [
      ...(this.value.additionalDescriptions ?? []),
      { key, value },
    ];
    return this;
  }

  contract(number: string, date?: string): FA3InvoiceBuilder {
    this.value.contract = {
      number,
      ...(date ? { date } : {}),
    };
    return this;
  }

  orderReference(number: string, date?: string): FA3InvoiceBuilder {
    const current = this.value.order ?? {};
    this.value.order = {
      ...current,
      number,
      ...(date ? { date } : {}),
    };
    return this;
  }

  order(totalGross: number | string): FA3InvoiceBuilder {
    const current = this.value.order ?? {};
    this.value.order = {
      ...current,
      totalGross,
    };
    return this;
  }

  orderLine(value: {
    description: string;
    quantity: number | string;
    unitNetPrice: number | string;
    vatRate?: number | string | null;
  }): FA3InvoiceBuilder {
    const current = this.value.order ?? {};
    const lines = current.lines ?? [];
    this.value.order = {
      ...current,
      lines: [...lines, { ...value }],
    };
    return this;
  }

  transactionTerms(value: {
    deliveryTerms?: string;
    contractualRate?: string;
    contractualCurrency?: string;
    intermediary?: boolean;
  }): FA3InvoiceBuilder {
    this.value.transactionTerms = { ...value };
    return this;
  }

  transport(
    kind: string,
    options: { orderNumber?: string; cargoDescription?: string; packageUnit?: string } = {},
  ): FA3InvoiceBuilder {
    this.value.transport = {
      kind,
      ...(options.orderNumber ? { orderNumber: options.orderNumber } : {}),
      ...(options.cargoDescription ? { cargoDescription: options.cargoDescription } : {}),
      ...(options.packageUnit ? { packageUnit: options.packageUnit } : {}),
    };
    return this;
  }

  correction(value: {
    reason: string;
    correctedInvoiceNumber: string;
    correctedInvoiceDate?: string;
    correctedKsefNumber?: string;
    correctionType?: string;
  }): FA3InvoiceBuilder {
    this.value.correctionReason = value.reason;
    this.value.correctedInvoiceNumber = value.correctedInvoiceNumber;
    if (value.correctedInvoiceDate !== undefined) {
      this.value.correctedInvoiceDate = value.correctedInvoiceDate;
    }
    if (value.correctedKsefNumber !== undefined) {
      this.value.correctedKsefNumber = value.correctedKsefNumber;
    }
    if (value.correctionType !== undefined) {
      this.value.correctionType = value.correctionType;
    }
    return this;
  }

  correctedPeriod(value: string): FA3InvoiceBuilder {
    this.value.correctedPeriod = value;
    return this;
  }

  correctedInvoiceNumberOverride(value: string): FA3InvoiceBuilder {
    this.value.correctedInvoiceNumberOverride = value;
    return this;
  }

  settlesAdvance(value: { invoiceNumber?: string; ksefNumber?: string } = {}): FA3InvoiceBuilder {
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

  advancePayment(value: FA3AdvancePayment): FA3InvoiceBuilder {
    this.value.advancePayments = [...(this.value.advancePayments ?? []), { ...value }];
    return this;
  }

  settlementAmount(value: number | string): FA3InvoiceBuilder {
    this.value.settlementAmount = value;
    return this;
  }

  settlementDetails(value: FA3Settlement): FA3InvoiceBuilder {
    this.value.settlement = {
      ...value,
      charges: (value.charges ?? []).map((row) => ({ ...row })),
      deductions: (value.deductions ?? []).map((row) => ({ ...row })),
    };
    return this;
  }

  payment(value: FA3PaymentTerms): FA3InvoiceBuilder {
    this.value.paymentTerms = {
      ...value,
      partialPayments: (value.partialPayments ?? []).map((row) => ({ ...row })),
      bankAccounts: (value.bankAccounts ?? []).map((row) => ({ ...row })),
      factorBankAccounts: (value.factorBankAccounts ?? []).map((row) => ({ ...row })),
    };
    return this;
  }

  bankAccount(value: FA3BankAccount): FA3InvoiceBuilder {
    const current = this.value.paymentTerms ?? {};
    this.value.paymentTerms = {
      ...current,
      bankAccounts: [...(current.bankAccounts ?? []), { ...value }],
    };
    return this;
  }

  paymentLink(value: string, ipksef?: string): FA3InvoiceBuilder {
    const current = this.value.paymentTerms ?? {};
    this.value.paymentTerms = {
      ...current,
      paymentLink: value,
      ...(ipksef ? { ipksef } : {}),
    };
    return this;
  }

  paymentDue(
    date: string,
    method: "1" | "2" | "3" | "4" | "5" | "6" | "7" | "transfer" | "cash" | "card" | "voucher" | "check" | "credit" | "compensation" | "other" = "6",
  ): FA3InvoiceBuilder {
    const current = this.value.paymentTerms ?? {};
    this.value.paymentTerms = {
      ...current,
      dueDate: date,
      method,
    };
    return this;
  }

  paymentDueDescription(
    amount: number,
    unit: string,
    startsFrom: string,
    method: "1" | "2" | "3" | "4" | "5" | "6" | "7" | "transfer" | "cash" | "card" | "voucher" | "check" | "credit" | "compensation" | "other" = "6",
  ): FA3InvoiceBuilder {
    const current = this.value.paymentTerms ?? {};
    this.value.paymentTerms = {
      ...current,
      dueDescription: `${amount} ${unit} od ${startsFrom}`,
      method,
    };
    return this;
  }

  paid(value: string): FA3InvoiceBuilder {
    const current = this.value.paymentTerms ?? {};
    this.value.paymentTerms = {
      ...current,
      paidDate: value,
    };
    return this;
  }

  partiallyPaid(value: {
    amount: number | string;
    paidOn: string;
    method?: FA3PaymentMethod;
    otherMethodDescription?: string;
  }): FA3InvoiceBuilder {
    const current = this.value.paymentTerms ?? {};
    const list = current.partialPayments ?? [];
    this.value.paymentTerms = {
      ...current,
      partialPayments: [...list, { ...value }],
    };
    return this;
  }

  foreignCurrencyRate(value: number | string): FA3InvoiceBuilder {
    this.value.foreignCurrencyRate = value;
    return this;
  }

  asSimplifiedReceiptLike(): FA3InvoiceBuilder {
    this.value.simplifiedReceiptLike = true;
    return this;
  }

  attachmentText(value: string): FA3InvoiceBuilder {
    this.value.attachmentText = value;
    return this;
  }

  attachment(value: {
    blocks: Array<{
      header?: string;
      paragraphs?: string[];
      tables?: Array<{ headers: string[]; rows: string[][] }>;
    }>;
  }): FA3InvoiceBuilder {
    this.value.attachment = {
      blocks: value.blocks.map((block) => ({
        ...block,
        ...(block.paragraphs ? { paragraphs: [...block.paragraphs] } : {}),
        ...(block.tables
          ? {
              tables: block.tables.map((table) => ({
                headers: [...table.headers],
                rows: table.rows.map((row) => [...row]),
              })),
            }
          : {}),
      })),
    };
    return this;
  }

  addLine(value: FA3Line): FA3InvoiceBuilder {
    this.value.lines.push({ ...value });
    return this;
  }

  addGoodsLine(
    description: string,
    options: {
      quantity: number | string;
      unitNetPrice: number | string;
      unit?: string;
      vatRate?: number | string | null;
      vatCode?: string;
      vatAmountPln?: number | string | null;
      xiiVatRate?: number | string | null;
      gtu?: string;
      procedure?: string;
      annex15?: boolean;
      netAmount?: number | string;
      vatAmount?: number | string;
      grossAmount?: number | string;
    },
  ): FA3InvoiceBuilder {
    return this.addLine({
      description,
      quantity: options.quantity,
      unit: options.unit ?? "szt",
      unitNetPrice: options.unitNetPrice,
      ...(options.vatRate !== undefined ? { vatRate: options.vatRate } : {}),
      ...(options.vatCode !== undefined ? { vatCode: options.vatCode } : {}),
      ...(options.vatAmountPln !== undefined ? { vatAmountPln: options.vatAmountPln } : {}),
      ...(options.xiiVatRate !== undefined ? { xiiVatRate: options.xiiVatRate } : {}),
      ...(options.gtu !== undefined ? { gtu: options.gtu } : {}),
      ...(options.procedure !== undefined ? { procedure: options.procedure } : {}),
      ...(options.annex15 !== undefined ? { annex15: options.annex15 } : {}),
      ...(options.netAmount !== undefined ? { netAmount: options.netAmount } : {}),
      ...(options.vatAmount !== undefined ? { vatAmount: options.vatAmount } : {}),
      ...(options.grossAmount !== undefined ? { grossAmount: options.grossAmount } : {}),
    });
  }

  addServiceLine(
    description: string,
    options: Parameters<FA3InvoiceBuilder["addGoodsLine"]>[1],
  ): FA3InvoiceBuilder {
    return this.addGoodsLine(description, options);
  }

  splitPayment(): FA3InvoiceBuilder {
    const current = this.value.paymentTerms ?? {};
    this.value.paymentTerms = {
      ...current,
      method: "6",
    };
    this.value.splitPaymentAnnotation = true;
    return this;
  }

  addCorrectedLineBeforeAfter(value: { before: FA3Line; after: FA3Line }): FA3InvoiceBuilder {
    this.value.lines.push({ ...value.before, beforeCorrection: true });
    this.value.lines.push({ ...value.after, beforeCorrection: false });
    return this;
  }

  rawExtension(pathValue: string, xml: string): FA3InvoiceBuilder {
    this.value.rawExtensions = [...(this.value.rawExtensions ?? []), { path: pathValue, xml }];
    return this;
  }

  build(): FA3Draft {
    return new FA3Draft(this.value);
  }

  validate(): FA3ValidationIssue[] {
    return this.build().validate();
  }

  async toXml(options: FA3XmlOptions = {}): Promise<string> {
    return this.build().toXml(options);
  }
}

export class BasicInvoiceBuilder extends FA3InvoiceBuilder {
  constructor(invoiceNumber: string) {
    super(invoiceNumber, "basic");
  }
}

export class SimplifiedInvoiceBuilder extends FA3InvoiceBuilder {
  constructor(invoiceNumber: string) {
    super(invoiceNumber, "simplified");
  }
}

export class CorrectionInvoiceBuilder extends FA3InvoiceBuilder {
  constructor(invoiceNumber: string, kind: FA3InvoiceKind = "correction") {
    super(invoiceNumber, kind);
  }
}

export class AdvanceInvoiceBuilder extends FA3InvoiceBuilder {
  constructor(invoiceNumber: string, kind: FA3InvoiceKind = "advance") {
    super(invoiceNumber, kind);
  }
}

export class SettlementInvoiceBuilder extends FA3InvoiceBuilder {
  constructor(invoiceNumber: string, kind: FA3InvoiceKind = "settlement") {
    super(invoiceNumber, kind);
  }
}

export class AdvanceCorrectionInvoiceBuilder extends FA3InvoiceBuilder {
  constructor(invoiceNumber: string) {
    super(invoiceNumber, "advance_correction");
  }
}

export class SettlementCorrectionInvoiceBuilder extends FA3InvoiceBuilder {
  constructor(invoiceNumber: string) {
    super(invoiceNumber, "settlement_correction");
  }
}

export class FA3Invoice {
  static basic(invoiceNumber: string): BasicInvoiceBuilder {
    return new BasicInvoiceBuilder(invoiceNumber);
  }

  static simplified(invoiceNumber: string): SimplifiedInvoiceBuilder {
    return new SimplifiedInvoiceBuilder(invoiceNumber);
  }

  static correction(invoiceNumber: string): CorrectionInvoiceBuilder {
    return new CorrectionInvoiceBuilder(invoiceNumber);
  }

  static advance(invoiceNumber: string): AdvanceInvoiceBuilder {
    return new AdvanceInvoiceBuilder(invoiceNumber);
  }

  static settlement(invoiceNumber: string): SettlementInvoiceBuilder {
    return new SettlementInvoiceBuilder(invoiceNumber);
  }

  static advanceCorrection(invoiceNumber: string): AdvanceCorrectionInvoiceBuilder {
    return new AdvanceCorrectionInvoiceBuilder(invoiceNumber);
  }

  static settlementCorrection(invoiceNumber: string): SettlementCorrectionInvoiceBuilder {
    return new SettlementCorrectionInvoiceBuilder(invoiceNumber);
  }

  static advance_correction(invoiceNumber: string): AdvanceCorrectionInvoiceBuilder {
    return new AdvanceCorrectionInvoiceBuilder(invoiceNumber);
  }

  static settlement_correction(invoiceNumber: string): SettlementCorrectionInvoiceBuilder {
    return new SettlementCorrectionInvoiceBuilder(invoiceNumber);
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
      const fileName = `${sanitizeFileName(draft.toDict().invoiceNumber, `invoice-${i + 1}`)}.xml`;
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
      entries.push({
        fileName: `${sanitizeFileName(draft.toDict().invoiceNumber, `invoice-${i + 1}`)}.xml`,
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

export function sanitizeFileName(value: string, fallback = "faktura"): string {
  const candidate = value.trim().replace(/[^A-Za-z0-9_.-]+/g, "_");
  return candidate || fallback;
}

export const BaseFA3Builder = FA3InvoiceBuilder;
