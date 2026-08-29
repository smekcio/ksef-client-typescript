import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COLLECTIVE_IDENTIFIER_EXCEPTION_CODES,
  MAX_IDENTIFIERS_PER_INVOICE,
  MAX_INVOICES_PER_IDENTIFIER,
  MIN_INVOICES_PER_IDENTIFIER,
  PAGE_SIZE_INVOICES_MAX,
  expandQueryDateBound,
  isValidCollectiveIdentifierNumber,
  makeCollectiveIdentifierInvoice,
  requireCollectiveIdentifierNumber,
  requireGenerateInvoices,
  requireInvoicesQueryIdentifiers,
  requirePageSize,
  requireQueryDateRange,
  validateCollectiveIdentifierNumber,
} from "../../dist/index.js";

const VALID_IZ = "5265877635-IZ202508-0100001AF629-FC";
const VALID_IZ_2 = "5265877635-IZ202509-0100001AF629-19";
const VALID_KSEF = "5265877635-20250826-0100001AF629-AF";
const VALID_KSEF_2 = "5265877635-20250827-0100001AF629-4A";

test("validates collective identifier checksum", () => {
  const result = validateCollectiveIdentifierNumber(VALID_IZ);
  assert.equal(result.isValid, true);
  assert.equal(isValidCollectiveIdentifierNumber(VALID_IZ), true);
});

test("rejects empty collective identifier", () => {
  const result = validateCollectiveIdentifierNumber("");
  assert.equal(result.isValid, false);
  assert.match(result.message, /empty/);
});

test("rejects invalid collective identifier length", () => {
  const result = validateCollectiveIdentifierNumber("too-short");
  assert.equal(result.isValid, false);
  assert.match(result.message, /invalid length/);
});

test("rejects invalid collective identifier format", () => {
  const result = validateCollectiveIdentifierNumber("5265877635-XX202508-0100001AF629-FC");
  assert.equal(result.isValid, false);
  assert.match(result.message, /invalid format/);
});

test("rejects invalid collective identifier checksum", () => {
  const invalid = "5265877635-IZ202508-0100001AF629-00";
  const result = validateCollectiveIdentifierNumber(invalid);
  assert.equal(result.isValid, false);
  assert.match(result.message, /checksum mismatch/);
});

test("requireCollectiveIdentifierNumber returns value or throws", () => {
  assert.equal(requireCollectiveIdentifierNumber(VALID_IZ), VALID_IZ);
  assert.throws(
    () => requireCollectiveIdentifierNumber("bad"),
    /Invalid collective identifier number/,
  );
});

test("requirePageSize accepts values in range and rejects others", () => {
  assert.equal(requirePageSize(10), 10);
  assert.equal(requirePageSize(200), 200);
  assert.equal(requirePageSize(500, PAGE_SIZE_INVOICES_MAX), 500);
  assert.throws(() => requirePageSize(9), /page_size must be between 10 and 200/);
  assert.throws(() => requirePageSize(201), /page_size must be between 10 and 200/);
});

test("requireInvoicesQueryIdentifiers normalizes a single string and a list", () => {
  assert.deepEqual(requireInvoicesQueryIdentifiers(VALID_IZ), [VALID_IZ]);
  assert.deepEqual(requireInvoicesQueryIdentifiers([VALID_IZ, VALID_IZ_2]), [VALID_IZ, VALID_IZ_2]);
});

test("requireInvoicesQueryIdentifiers rejects empty, duplicate and oversized lists", () => {
  assert.throws(() => requireInvoicesQueryIdentifiers([]), /At least one collective identifier/);
  assert.throws(
    () => requireInvoicesQueryIdentifiers([VALID_IZ, VALID_IZ]),
    /Duplicate collective identifier/,
  );
  assert.throws(
    () => requireInvoicesQueryIdentifiers(Array.from({ length: 11 }, () => VALID_IZ)),
    /Cannot query more than 10/,
  );
});

test("requireQueryDateRange expands and enforces a 100-day window", () => {
  assert.deepEqual(requireQueryDateRange("2026-01-01", "2026-04-11"), ["2026-01-01", "2026-04-11"]);
  assert.throws(() => requireQueryDateRange("2026-01-01", "2026-04-12"), /cannot exceed 100 days/);
  assert.throws(
    () => requireQueryDateRange("2026-04-01", "2026-01-01"),
    /must be earlier than or equal/,
  );
  assert.throws(() => requireQueryDateRange("", "2026-01-02"), /dateCreatedFrom is required/);
  assert.throws(() => requireQueryDateRange("2026-01-01", "not-a-date"), /Invalid dateCreatedTo/);
});

test("expandQueryDateBound expands date-only bounds to UTC day edges", () => {
  assert.equal(expandQueryDateBound("2026-01-01", false), "2026-01-01T00:00:00Z");
  assert.equal(expandQueryDateBound("2026-01-01", true), "2026-01-01T23:59:59Z");
  assert.equal(expandQueryDateBound("2026-01-01T12:00:00Z", false), "2026-01-01T12:00:00Z");
});

test("makeCollectiveIdentifierInvoice builds optional payment and description", () => {
  const invoice = makeCollectiveIdentifierInvoice(VALID_KSEF, {
    description: "transfer",
    amount: "150.00",
    currency: "PLN",
  });
  assert.equal(invoice.ksefNumber, VALID_KSEF);
  assert.equal(invoice.description, "transfer");
  assert.deepEqual(invoice.payment, { amount: 150, currency: "PLN" });

  const numeric = makeCollectiveIdentifierInvoice(VALID_KSEF, {
    description: null,
    amount: 10,
    currency: "EUR",
  });
  assert.equal(numeric.description, null);
  assert.deepEqual(numeric.payment, { amount: 10, currency: "EUR" });
});

test("makeCollectiveIdentifierInvoice rejects invalid payment and oversized description", () => {
  assert.throws(
    () => makeCollectiveIdentifierInvoice(VALID_KSEF, { amount: 10 }),
    /amount and currency must be provided together/,
  );
  assert.throws(
    () => makeCollectiveIdentifierInvoice(VALID_KSEF, { currency: "PLN" }),
    /amount and currency must be provided together/,
  );
  assert.throws(
    () => makeCollectiveIdentifierInvoice(VALID_KSEF, { amount: "nope", currency: "PLN" }),
    /Invalid payment amount/,
  );
  assert.throws(
    () => makeCollectiveIdentifierInvoice(VALID_KSEF, { amount: 1, currency: "zł" }),
    /Invalid payment currency/,
  );
  assert.throws(
    () => makeCollectiveIdentifierInvoice(VALID_KSEF, { description: "x".repeat(513) }),
    /cannot exceed 512 characters/,
  );
});

test("requireGenerateInvoices enforces min, max, uniqueness and description length", () => {
  assert.throws(() => requireGenerateInvoices([]), /at least 2 invoices/);
  assert.throws(() => requireGenerateInvoices([{ ksefNumber: VALID_KSEF }]), /at least 2 invoices/);
  const tooMany = Array.from({ length: MAX_INVOICES_PER_IDENTIFIER + 1 }, (_, index) => ({
    ksefNumber: index % 2 === 0 ? VALID_KSEF : VALID_KSEF_2,
  }));
  assert.throws(() => requireGenerateInvoices(tooMany), /more than 500 invoices/);
  assert.throws(
    () => requireGenerateInvoices([{ ksefNumber: VALID_KSEF }, { ksefNumber: VALID_KSEF }]),
    /Duplicate KSeF number/,
  );
  assert.throws(
    () =>
      requireGenerateInvoices([
        { ksefNumber: VALID_KSEF, description: "x".repeat(513) },
        { ksefNumber: VALID_KSEF_2 },
      ]),
    /cannot exceed 512 characters/,
  );
  const accepted = requireGenerateInvoices([
    { ksefNumber: VALID_KSEF },
    { ksefNumber: VALID_KSEF_2 },
  ]);
  assert.equal(accepted.length, 2);
  assert.equal(requireGenerateInvoices([{ ksefNumber: VALID_KSEF }], { minInvoices: 1 }).length, 1);
});

test("exposes IZ exception codes and context limits", () => {
  assert.equal(
    COLLECTIVE_IDENTIFIER_EXCEPTION_CODES[71001],
    "Invoice cannot be assigned to a collective identifier",
  );
  assert.equal(
    COLLECTIVE_IDENTIFIER_EXCEPTION_CODES[71002],
    "Invoice is already assigned to the maximum number of collective identifiers",
  );
  assert.equal(MIN_INVOICES_PER_IDENTIFIER, 2);
  assert.equal(MAX_IDENTIFIERS_PER_INVOICE, 132);
});
