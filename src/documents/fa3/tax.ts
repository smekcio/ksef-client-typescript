import { FA3Line } from "./types";

function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number): number {
  return Number(value.toFixed(2));
}

function isNumericRateString(value: string): boolean {
  return /^-?\d+([.,]\d+)?$/.test(value.trim());
}

/** Kubełki podsumowania VAT FA(3). */
export type FaVatBucketKey =
  | "23or22"
  | "8or7"
  | "5"
  | "4or3"
  | "0KR"
  | "0WDT"
  | "0EX"
  | "zw"
  | "npI"
  | "npII"
  | "oo";

const BUCKET_ORDER: FaVatBucketKey[] = [
  "23or22",
  "8or7",
  "5",
  "4or3",
  "0KR",
  "0WDT",
  "0EX",
  "zw",
  "npI",
  "npII",
  "oo",
];

const BUCKET_TAGS: Record<FaVatBucketKey, { net: string; vat?: string; vatW?: string }> = {
  "23or22": { net: "P_13_1", vat: "P_14_1", vatW: "P_14_1W" },
  "8or7": { net: "P_13_2", vat: "P_14_2", vatW: "P_14_2W" },
  "5": { net: "P_13_3", vat: "P_14_3", vatW: "P_14_3W" },
  "4or3": { net: "P_13_4", vat: "P_14_4", vatW: "P_14_4W" },
  "0KR": { net: "P_13_6_1" },
  "0WDT": { net: "P_13_6_2" },
  "0EX": { net: "P_13_6_3" },
  zw: { net: "P_13_7" },
  npI: { net: "P_13_8" },
  npII: { net: "P_13_9" },
  oo: { net: "P_13_10" },
};

export interface TaxSummaryRow {
  rateCode: string;
  net: number;
  vat: number;
  gross: number;
  vatPln?: number;
}

/** Mapuje kod FA(3) / numeryczny rate na kubełek P_13_x. Pusty/nieznany → 23or22. */
export function faVatBucketForCode(code: string | null | undefined): FaVatBucketKey {
  const trimmed = code?.trim() || "23";
  switch (trimmed) {
    case "23":
    case "22":
      return "23or22";
    case "8":
    case "7":
      return "8or7";
    case "5":
      return "5";
    case "4":
    case "3":
      return "4or3";
    case "0 KR":
      return "0KR";
    case "0 WDT":
      return "0WDT";
    case "0 EX":
      return "0EX";
    case "zw":
      return "zw";
    case "np I":
      return "npI";
    case "np II":
      return "npII";
    case "oo":
      return "oo";
    default:
      return "23or22";
  }
}

/** Kod stawki do P_12 / grupowania: vatCode, potem nienumeryczny vatRate, potem liczba. */
export function resolveVatRateCode(line: FA3Line): string {
  const fromCode = line.vatCode?.trim();
  if (fromCode) return fromCode;

  if (line.vatRate === null || line.vatRate === undefined || line.vatRate === "") {
    return "0 KR";
  }

  if (typeof line.vatRate === "string") {
    const trimmed = line.vatRate.trim();
    if (trimmed && !isNumericRateString(trimmed)) {
      return trimmed;
    }
  }

  const n = toNumber(line.vatRate);
  if (Math.abs(n) < 1e-12) return "0 KR";
  return String(n);
}

export class TaxSummary {
  static fromLines(
    lines: FA3Line[],
    options: { treatBeforeCorrectionAsNegative?: boolean } = {},
  ): TaxSummaryRow[] {
    const invertBefore = Boolean(options.treatBeforeCorrectionAsNegative);
    const map = new Map<string, TaxSummaryRow>();
    for (const line of lines) {
      const qty = toNumber(line.quantity);
      const unitNet = toNumber(line.unitNetPrice);
      const rate = line.vatRate === null || line.vatRate === undefined ? 0 : toNumber(line.vatRate);
      const rateCode = resolveVatRateCode(line);
      const sign = invertBefore && line.beforeCorrection ? -1 : 1;
      const unsignedNet = toNumber(line.netAmount ?? qty * unitNet);
      const unsignedVat = toNumber(
        line.vatAmount ?? (rate === 0 || !Number.isFinite(rate) ? 0 : (unsignedNet * rate) / 100),
      );
      const unsignedGross = toNumber(line.grossAmount ?? unsignedNet + unsignedVat);
      const prev = map.get(rateCode) ?? { rateCode, net: 0, vat: 0, gross: 0, vatPln: 0 };
      prev.net = money(prev.net + sign * unsignedNet);
      prev.vat = money(prev.vat + sign * unsignedVat);
      prev.gross = money(prev.gross + sign * unsignedGross);
      if (line.vatAmountPln != null && line.vatAmountPln !== "") {
        prev.vatPln = money((prev.vatPln ?? 0) + sign * toNumber(line.vatAmountPln));
      }
      map.set(rateCode, prev);
    }
    return [...map.values()];
  }
}

type BucketAmounts = { net: number; vat: number; vatPln: number | null };

/**
 * Zamienia wiersze TaxSummary na pola Fa (P_13_x / P_14_x / P_14_xW).
 * Wartości jako stringi xx.xx (jak money() w builderze).
 */
export function taxSummaryToFaFields(
  rows: TaxSummaryRow[],
  options: { includeVatPln?: boolean } = {},
): Record<string, string> {
  const includeVatPln = Boolean(options.includeVatPln);
  const buckets = new Map<FaVatBucketKey, BucketAmounts>();

  for (const row of rows) {
    const key = faVatBucketForCode(row.rateCode);
    const prev = buckets.get(key) ?? {
      net: 0,
      vat: 0,
      vatPln: includeVatPln ? 0 : null,
    };
    prev.net = money(prev.net + row.net);
    prev.vat = money(prev.vat + row.vat);
    if (includeVatPln) {
      prev.vatPln = money((prev.vatPln ?? 0) + (row.vatPln ?? 0));
    }
    buckets.set(key, prev);
  }

  const fields: Record<string, string> = {};
  for (const key of BUCKET_ORDER) {
    const amounts = buckets.get(key);
    if (!amounts) continue;
    const tags = BUCKET_TAGS[key];
    fields[tags.net] = amounts.net.toFixed(2);
    if (tags.vat) {
      fields[tags.vat] = amounts.vat.toFixed(2);
      if (includeVatPln && tags.vatW && amounts.vatPln != null) {
        fields[tags.vatW] = amounts.vatPln.toFixed(2);
      }
    }
  }
  return fields;
}
