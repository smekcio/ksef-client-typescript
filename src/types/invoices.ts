import { KsefValidationError } from "../errors/errors";
import { EncryptionInfo, JsonObject, StatusInfo } from "./common";

export type IsoDateString = `${number}-${number}-${number}`;
export type IsoDateTimeString = `${number}-${number}-${number}T${string}`;
export type IsoDateInput = IsoDateString | IsoDateTimeString;

export interface InvoiceDateRangeFilter extends JsonObject {
  dateType: string;
  from: IsoDateInput;
  to?: IsoDateInput | null;
  restrictToPermanentStorageHwmDate?: boolean | null;
}

export interface InvoiceQueryFilters extends JsonObject {
  subjectType: string;
  dateRange: InvoiceDateRangeFilter;
}

export interface InvoiceExportRequest {
  encryption: EncryptionInfo;
  filters: InvoiceQueryFilters;
  includeMetadata?: boolean;
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

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?(?:Z|[+-](?:[01]\d|2[0-3]):?[0-5]\d)?$/;
const MAX_DATE_RANGE_MONTHS = 3;

export function validateInvoiceQueryFilters(filters: InvoiceQueryFilters): void {
  if (!isPlainObject(filters)) {
    throw new KsefValidationError("Invoice query filters must be an object.");
  }

  const subjectType = (filters as Record<string, unknown>).subjectType;
  if (typeof subjectType !== "string" || subjectType.trim().length === 0) {
    throw new KsefValidationError(
      "Invoice query filters.subjectType must be a non-empty string.",
    );
  }

  const dateRange = (filters as Record<string, unknown>).dateRange;
  if (dateRange === undefined || dateRange === null) {
    throw new KsefValidationError("Invoice query filters.dateRange is required.");
  }
  if (!isPlainObject(dateRange)) {
    throw new KsefValidationError("Invoice query filters.dateRange must be an object.");
  }

  const dateType = dateRange.dateType;
  if (typeof dateType !== "string" || dateType.trim().length === 0) {
    throw new KsefValidationError(
      "Invoice query filters.dateRange.dateType must be a non-empty string.",
    );
  }

  const fromValue = dateRange.from;
  const toValue = dateRange.to;
  if (typeof fromValue !== "string" || fromValue.trim().length === 0) {
    throw new KsefValidationError(
      "Invoice query filters.dateRange.from must be a non-empty ISO date or ISO date-time string.",
    );
  }
  if (
    toValue !== undefined &&
    toValue !== null &&
    (typeof toValue !== "string" || toValue.trim().length === 0)
  ) {
    throw new KsefValidationError(
      "Invoice query filters.dateRange.to must be a valid ISO date/date-time string when provided.",
    );
  }

  const fromText = fromValue.trim();
  const fromDate = parseIsoDateInput(fromText, "dateRange.from");
  const toText =
    typeof toValue === "string" && toValue.trim().length > 0
      ? toValue.trim()
      : new Date().toISOString();
  const toDate =
    typeof toValue === "string" && toValue.trim().length > 0
      ? parseIsoDateInput(toText, "dateRange.to")
      : new Date(toText);

  if (toDate.getTime() < fromDate.getTime()) {
    throw new KsefValidationError(
      "Invoice query filters.dateRange.to must be greater than or equal to dateRange.from.",
    );
  }

  const maxAllowedToDate = addMonthsClamped(fromDate, MAX_DATE_RANGE_MONTHS);
  if (toDate.getTime() > maxAllowedToDate.getTime()) {
    throw new KsefValidationError(
      `Invoice query filters.dateRange cannot exceed ${MAX_DATE_RANGE_MONTHS} months.`,
      [
        `dateRange.from: ${fromText}`,
        `dateRange.to: ${toText}`,
      ],
    );
  }
}

function parseIsoDateInput(value: string, fieldPath: string): Date {
  if (ISO_DATE_PATTERN.test(value)) {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(5, 7));
    const day = Number(value.slice(8, 10));
    if (!isValidCalendarDate(year, month, day)) {
      throw new KsefValidationError(
        `Invoice query filters.${fieldPath} must be a valid calendar date in YYYY-MM-DD format.`,
      );
    }
    return new Date(Date.UTC(year, month - 1, day));
  }

  if (!ISO_DATE_TIME_PATTERN.test(value)) {
    throw new KsefValidationError(
      `Invoice query filters.${fieldPath} must be a valid ISO date-time or date string.`,
    );
  }

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (!isValidCalendarDate(year, month, day)) {
    throw new KsefValidationError(
      `Invoice query filters.${fieldPath} contains an invalid calendar date.`,
    );
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new KsefValidationError(
      `Invoice query filters.${fieldPath} must be a valid ISO date-time string.`,
    );
  }
  return parsed;
}

function addMonthsClamped(value: Date, months: number): Date {
  const targetMonthIndex = value.getUTCMonth() + months;
  const targetYear = value.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
  const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
  const daysInTargetMonth = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  const targetDay = Math.min(value.getUTCDate(), daysInTargetMonth);

  return new Date(
    Date.UTC(
      targetYear,
      normalizedMonth,
      targetDay,
      value.getUTCHours(),
      value.getUTCMinutes(),
      value.getUTCSeconds(),
      value.getUTCMilliseconds(),
    ),
  );
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  if (month < 1 || month > 12 || day < 1) {
    return false;
  }
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
