import assert from "node:assert/strict";
import { test } from "node:test";
import { KsefValidationError, validateInvoiceQueryFilters } from "../../dist/index.js";

test("validateInvoiceQueryFilters accepts date range up to 3 months", () => {
  assert.doesNotThrow(() => {
    validateInvoiceQueryFilters({
      subjectType: "Subject1",
      dateRange: {
        dateType: "Issue",
        from: "2025-01-01",
        to: "2025-04-01",
      },
    });
  });
});

test("validateInvoiceQueryFilters throws KsefValidationError for date range over 3 months", () => {
  assert.throws(
    () =>
      validateInvoiceQueryFilters({
        subjectType: "Subject1",
        dateRange: {
          dateType: "Issue",
          from: "2025-01-01",
          to: "2025-04-02",
        },
      }),
    KsefValidationError,
  );
});

test("validateInvoiceQueryFilters throws KsefValidationError for invalid date", () => {
  assert.throws(
    () =>
      validateInvoiceQueryFilters({
        subjectType: "Subject1",
        dateRange: {
          dateType: "Issue",
          from: "2025-02-30",
          to: "2025-03-01",
        },
      }),
    KsefValidationError,
  );
});

test("validateInvoiceQueryFilters accepts missing dateRange.to by using current UTC date-time", () => {
  const yesterdayIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  assert.doesNotThrow(() => {
    validateInvoiceQueryFilters({
      subjectType: "Subject1",
      dateRange: {
        dateType: "Issue",
        from: yesterdayIso,
      },
    });
  });
});
