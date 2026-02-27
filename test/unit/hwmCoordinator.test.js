import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dedupeByKsefNumber,
  getEffectiveStartDate,
  updateContinuationPoint,
} from "../../dist/index.js";

test("updateContinuationPoint prioritizes truncated package date and clears when no dates available", () => {
  const continuationPoints = {};

  updateContinuationPoint(continuationPoints, "invoice", {
    isTruncated: true,
    lastPermanentStorageDate: "2025-01-02T00:00:00Z",
    permanentStorageHwmDate: "2025-01-01T00:00:00Z",
  });
  assert.equal(continuationPoints.invoice, "2025-01-02T00:00:00Z");

  updateContinuationPoint(continuationPoints, "invoice", {
    isTruncated: false,
    permanentStorageHwmDate: "2025-01-03T00:00:00Z",
  });
  assert.equal(continuationPoints.invoice, "2025-01-03T00:00:00Z");

  updateContinuationPoint(continuationPoints, "invoice", {});
  assert.equal("invoice" in continuationPoints, false);
});

test("getEffectiveStartDate returns continuation point when available", () => {
  const continuationPoints = { subjectA: "2025-02-10T10:00:00Z" };

  assert.equal(
    getEffectiveStartDate(continuationPoints, "subjectA", "2025-01-01T00:00:00Z"),
    "2025-02-10T10:00:00Z",
  );
  assert.equal(
    getEffectiveStartDate(continuationPoints, "subjectB", "2025-01-01T00:00:00Z"),
    "2025-01-01T00:00:00Z",
  );
});

test("dedupeByKsefNumber keeps first case-insensitive occurrence and skips missing values", () => {
  const summaries = [
    { ksefNumber: "ABC-123", idx: 1 },
    { KsefNumber: "abc-123", idx: 2 },
    { KsefNumber: "XYZ-999", idx: 3 },
    { other: "missing-ksef-number" },
  ];

  const unique = dedupeByKsefNumber(summaries);

  assert.deepEqual(Object.keys(unique), ["ABC-123", "XYZ-999"]);
  assert.deepEqual(unique["ABC-123"], summaries[0]);
  assert.deepEqual(unique["XYZ-999"], summaries[2]);
});
