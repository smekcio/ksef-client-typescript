import { FA3Line } from "./types";

function toNumber(value: number | string): number {
  const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number): number {
  return Number(value.toFixed(2));
}

export interface TaxSummaryRow {
  rateCode: string;
  net: number;
  vat: number;
  gross: number;
}

export class TaxSummary {
  static fromLines(lines: FA3Line[]): TaxSummaryRow[] {
    const map = new Map<string, TaxSummaryRow>();
    for (const line of lines) {
      const qty = toNumber(line.quantity);
      const unitNet = toNumber(line.unitNetPrice);
      const rate = line.vatRate === null || line.vatRate === undefined ? 0 : toNumber(line.vatRate);
      const rateCode = rate === 0 ? "0 KR" : String(rate);
      const net = toNumber(line.netAmount ?? qty * unitNet);
      const vat = toNumber(line.vatAmount ?? (rate === 0 ? 0 : (net * rate) / 100));
      const gross = toNumber(line.grossAmount ?? net + vat);
      const prev = map.get(rateCode) ?? { rateCode, net: 0, vat: 0, gross: 0 };
      prev.net = money(prev.net + net);
      prev.vat = money(prev.vat + vat);
      prev.gross = money(prev.gross + gross);
      map.set(rateCode, prev);
    }
    return [...map.values()];
  }
}

