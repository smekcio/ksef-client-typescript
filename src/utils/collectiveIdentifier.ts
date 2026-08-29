import {
  CollectiveIdentifierInvoice,
  CollectiveIdentifierInvoicePayment,
  CurrencyCode,
} from "../types/openapi.generated";
import { requireKsefNumber } from "./ksefNumber";
import { crc8Hex } from "./crc8";

const COLLECTIVE_IDENTIFIER_PATTERN =
  /^(\d{10})-IZ(\d{4})(0[1-9]|1[0-2])-([0-9A-F]{12})-([0-9A-F]{2})$/;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export const COLLECTIVE_IDENTIFIER_LENGTH = 35;
export const MAX_INVOICES_PER_IDENTIFIER = 500;
export const MIN_INVOICES_PER_IDENTIFIER = 2;
export const MAX_IDENTIFIERS_PER_INVOICE = 132;
export const MAX_IDENTIFIERS_PER_INVOICES_QUERY = 10;
export const MAX_QUERY_RANGE_DAYS = 100;
export const MAX_INVOICE_DESCRIPTION_LENGTH = 512;
export const PAGE_SIZE_MIN = 10;
export const PAGE_SIZE_MAX = 200;
export const PAGE_SIZE_INVOICES_MAX = 500;

export const COLLECTIVE_IDENTIFIER_EXCEPTION_CODES: Record<number, string> = {
  71001: "Invoice cannot be assigned to a collective identifier",
  71002: "Invoice is already assigned to the maximum number of collective identifiers",
};

export interface CollectiveIdentifierValidationResult {
  isValid: boolean;
  message?: string;
}

export function validateCollectiveIdentifierNumber(
  collectiveIdentifierNumber: string,
): CollectiveIdentifierValidationResult {
  if (!collectiveIdentifierNumber) {
    return { isValid: false, message: "empty value" };
  }

  if (collectiveIdentifierNumber.length !== COLLECTIVE_IDENTIFIER_LENGTH) {
    return { isValid: false, message: "invalid length" };
  }

  if (!COLLECTIVE_IDENTIFIER_PATTERN.test(collectiveIdentifierNumber)) {
    return { isValid: false, message: "invalid format" };
  }

  const dataPart = collectiveIdentifierNumber.slice(0, 32);
  const checksum = collectiveIdentifierNumber.slice(-2);
  const expected = crc8Hex(dataPart);
  if (expected !== checksum) {
    return { isValid: false, message: `checksum mismatch (expected ${expected})` };
  }

  return { isValid: true, message: "ok" };
}

export function isValidCollectiveIdentifierNumber(collectiveIdentifierNumber: string): boolean {
  return validateCollectiveIdentifierNumber(collectiveIdentifierNumber).isValid;
}

export function requireCollectiveIdentifierNumber(collectiveIdentifierNumber: string): string {
  const result = validateCollectiveIdentifierNumber(collectiveIdentifierNumber);
  if (!result.isValid) {
    throw new Error(`Invalid collective identifier number: ${result.message}`);
  }
  return collectiveIdentifierNumber;
}

export function requirePageSize(value: number, maximum: number = PAGE_SIZE_MAX): number {
  if (PAGE_SIZE_MIN <= value && value <= maximum) {
    return value;
  }
  throw new Error(`page_size must be between ${PAGE_SIZE_MIN} and ${maximum}`);
}

export function requireInvoicesQueryIdentifiers(
  collectiveIdentifierNumbers: string | readonly string[],
): string[] {
  const numbers =
    typeof collectiveIdentifierNumbers === "string"
      ? [collectiveIdentifierNumbers]
      : [...collectiveIdentifierNumbers];
  if (numbers.length === 0) {
    throw new Error("At least one collective identifier number is required");
  }
  if (numbers.length > MAX_IDENTIFIERS_PER_INVOICES_QUERY) {
    throw new Error(
      `Cannot query more than ${MAX_IDENTIFIERS_PER_INVOICES_QUERY} collective identifiers at once`,
    );
  }
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const number of numbers) {
    const validated = requireCollectiveIdentifierNumber(number);
    if (seen.has(validated)) {
      throw new Error(`Duplicate collective identifier number in invoices query: ${validated}`);
    }
    seen.add(validated);
    normalized.push(validated);
  }
  return normalized;
}

export function requireQueryDateRange(dateFrom: string, dateTo: string): [string, string] {
  const parsedFrom = parseQueryDatetime(dateFrom, "dateCreatedFrom");
  const parsedTo = parseQueryDatetime(dateTo, "dateCreatedTo");
  if (parsedFrom.getTime() > parsedTo.getTime()) {
    throw new Error("dateCreatedFrom must be earlier than or equal to dateCreatedTo");
  }
  const spanDays = utcDateOnlyMs(parsedTo) - utcDateOnlyMs(parsedFrom);
  const spanDaysCount = spanDays / 86_400_000;
  if (spanDaysCount > MAX_QUERY_RANGE_DAYS) {
    throw new Error(`Collective identifier query range cannot exceed ${MAX_QUERY_RANGE_DAYS} days`);
  }
  return [dateFrom, dateTo];
}

export function expandQueryDateBound(value: string, endOfDay: boolean): string {
  if (DATE_ONLY_RE.test(value)) {
    return `${value}${endOfDay ? "T23:59:59Z" : "T00:00:00Z"}`;
  }
  return value;
}

export function makeCollectiveIdentifierInvoice(
  ksefNumber: string,
  options: {
    description?: string | null;
    amount?: number | string | null;
    currency?: CurrencyCode | string | null;
  } = {},
): CollectiveIdentifierInvoice {
  const validatedNumber = requireKsefNumber(ksefNumber);
  if (
    options.description !== undefined &&
    options.description !== null &&
    options.description.length > MAX_INVOICE_DESCRIPTION_LENGTH
  ) {
    throw new Error(
      `Invoice description cannot exceed ${MAX_INVOICE_DESCRIPTION_LENGTH} characters`,
    );
  }
  const payment = buildPayment(options.amount, options.currency);
  return {
    ksefNumber: validatedNumber,
    ...(options.description !== undefined ? { description: options.description } : {}),
    ...(payment ? { payment } : {}),
  };
}

export function requireGenerateInvoices(
  invoices: readonly CollectiveIdentifierInvoice[],
  options: { minInvoices?: number } = {},
): CollectiveIdentifierInvoice[] {
  const items = [...invoices];
  const minInvoices = options.minInvoices ?? MIN_INVOICES_PER_IDENTIFIER;
  if (items.length < minInvoices) {
    throw new Error(`Collective identifier requires at least ${minInvoices} invoices`);
  }
  if (items.length > MAX_INVOICES_PER_IDENTIFIER) {
    throw new Error(
      `Collective identifier cannot contain more than ${MAX_INVOICES_PER_IDENTIFIER} invoices`,
    );
  }

  const seen = new Set<string>();
  for (const invoice of items) {
    const ksefNumber = requireKsefNumber(String(invoice.ksefNumber));
    if (seen.has(ksefNumber)) {
      throw new Error(`Duplicate KSeF number in collective identifier request: ${ksefNumber}`);
    }
    seen.add(ksefNumber);
    if (
      invoice.description !== undefined &&
      invoice.description !== null &&
      invoice.description.length > MAX_INVOICE_DESCRIPTION_LENGTH
    ) {
      throw new Error(
        `Invoice description cannot exceed ${MAX_INVOICE_DESCRIPTION_LENGTH} characters`,
      );
    }
  }
  return items;
}

function buildPayment(
  amount: number | string | null | undefined,
  currency: CurrencyCode | string | null | undefined,
): CollectiveIdentifierInvoicePayment | undefined {
  if (amount === undefined || amount === null) {
    if (currency === undefined || currency === null) {
      return undefined;
    }
    throw new Error("payment amount and currency must be provided together");
  }
  if (currency === undefined || currency === null) {
    throw new Error("payment amount and currency must be provided together");
  }
  const parsedAmount = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(parsedAmount)) {
    throw new Error("Invalid payment amount");
  }
  const currencyCode = String(currency);
  if (!/^[A-Z]{3}$/.test(currencyCode)) {
    throw new Error("Invalid payment currency");
  }
  return {
    amount: parsedAmount,
    currency: currencyCode as CurrencyCode,
  };
}

function parseQueryDatetime(value: string, fieldName: string): Date {
  if (!value) {
    throw new Error(`${fieldName} is required`);
  }
  const normalized = expandQueryDateBound(value, fieldName === "dateCreatedTo").replace(
    "Z",
    "+00:00",
  );
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ${fieldName} datetime: ${value}`);
  }
  return parsed;
}

function utcDateOnlyMs(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}
