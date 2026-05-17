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
  onlyMetadata?: boolean;
  /**
   * @deprecated Use `onlyMetadata` instead.
   */
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
const ISO_DATE_TIME_WITHOUT_OFFSET_PATTERN =
  /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?$/;
const ISO_DATE_TIME_CAPTURE_PATTERN =
  /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>[01]\d|2[0-3]):(?<minute>[0-5]\d)(?::(?<second>[0-5]\d)(?:\.(?<fraction>\d{1,9}))?)?$/;
const MAX_DATE_RANGE_MONTHS = 3;
const WARSAW_TIME_ZONE = "Europe/Warsaw";

export function normalizeInvoiceQueryFilters(filters: InvoiceQueryFilters): InvoiceQueryFilters {
  if (!isPlainObject(filters)) {
    return filters;
  }
  const dateRange = (filters as Record<string, unknown>).dateRange;
  if (!isPlainObject(dateRange)) {
    return filters;
  }

  const normalizedDateRange: Record<string, unknown> = { ...dateRange };
  if (typeof normalizedDateRange.from === "string") {
    normalizedDateRange.from = normalizeDateTimeWithoutOffset(normalizedDateRange.from);
  }
  if (typeof normalizedDateRange.to === "string") {
    normalizedDateRange.to = normalizeDateTimeWithoutOffset(normalizedDateRange.to);
  }

  return {
    ...(filters as Record<string, unknown>),
    dateRange: normalizedDateRange,
  } as InvoiceQueryFilters;
}

export function validateInvoiceQueryFilters(filters: InvoiceQueryFilters): void {
  if (!isPlainObject(filters)) {
    throw new KsefValidationError("Invoice query filters must be an object.");
  }

  const subjectType = (filters as Record<string, unknown>).subjectType;
  if (typeof subjectType !== "string" || subjectType.trim().length === 0) {
    throw new KsefValidationError("Invoice query filters.subjectType must be a non-empty string.");
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
  const normalizedDateType = dateType.trim();
  const restrictToPermanentStorageHwmDate = dateRange.restrictToPermanentStorageHwmDate;
  if (
    restrictToPermanentStorageHwmDate === true &&
    normalizedDateType.toLowerCase() !== "permanentstorage"
  ) {
    throw new KsefValidationError(
      "Invoice query filters.dateRange.restrictToPermanentStorageHwmDate requires dateType PermanentStorage.",
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
  const normalizedFromText = normalizeDateTimeWithoutOffset(fromText);
  const fromDate = parseIsoDateInput(normalizedFromText, "dateRange.from");
  const toText =
    typeof toValue === "string" && toValue.trim().length > 0
      ? toValue.trim()
      : new Date().toISOString();
  const normalizedToText =
    typeof toValue === "string" && toValue.trim().length > 0
      ? normalizeDateTimeWithoutOffset(toText)
      : toText;
  const toDate =
    typeof toValue === "string" && toValue.trim().length > 0
      ? parseIsoDateInput(normalizedToText, "dateRange.to")
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
      [`dateRange.from: ${normalizedFromText}`, `dateRange.to: ${normalizedToText}`],
    );
  }
}

function normalizeDateTimeWithoutOffset(value: string): string {
  const text = value.trim();
  if (!ISO_DATE_TIME_WITHOUT_OFFSET_PATTERN.test(text)) {
    return text;
  }
  const match = ISO_DATE_TIME_CAPTURE_PATTERN.exec(text);
  if (!match?.groups) {
    return text;
  }
  const year = Number(match.groups.year);
  const month = Number(match.groups.month);
  const day = Number(match.groups.day);
  const hour = Number(match.groups.hour);
  const minute = Number(match.groups.minute);
  const second = Number(match.groups.second ?? "0");
  const fraction = match.groups.fraction ?? "";
  const millisecond = Number((fraction + "000").slice(0, 3));

  if (!isValidCalendarDate(year, month, day)) {
    return text;
  }

  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  const offsetMinutes = resolveWarsawOffsetMinutes(utcGuess);
  return `${text}${formatOffset(offsetMinutes)}`;
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

function resolveWarsawOffsetMinutes(utcGuessMs: number): number {
  let offset = getOffsetMinutesForTimezone(new Date(utcGuessMs), WARSAW_TIME_ZONE);
  let adjustedUtcMs = utcGuessMs - offset * 60_000;
  const recalculated = getOffsetMinutesForTimezone(new Date(adjustedUtcMs), WARSAW_TIME_ZONE);
  if (recalculated !== offset) {
    offset = recalculated;
  }
  return offset;
}

function getOffsetMinutesForTimezone(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const zonePart = parts.find((part) => part.type === "timeZoneName")?.value ?? "";
  const match = /^GMT(?<sign>[+-])(?<hours>\d{1,2})(?::?(?<minutes>\d{2}))?$/.exec(zonePart);
  if (!match?.groups) {
    throw new KsefValidationError(`Unsupported timezone offset format for ${timeZone}: ${zonePart}`);
  }
  const sign = match.groups.sign === "-" ? -1 : 1;
  const hours = Number(match.groups.hours);
  const minutes = Number(match.groups.minutes ?? "0");
  return sign * (hours * 60 + minutes);
}

function formatOffset(offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? "-" : "+";
  const abs = Math.abs(offsetMinutes);
  const hours = Math.floor(abs / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (abs % 60).toString().padStart(2, "0");
  return `${sign}${hours}:${minutes}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
