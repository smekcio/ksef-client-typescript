import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isValidCollectiveIdentifierNumber,
  requireCollectiveIdentifierNumber,
  validateCollectiveIdentifierNumber,
} from "../../dist/index.js";

const VALID_IZ = "5265877635-IZ202508-0100001AF629-FC";

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

test("rejects invalid collective identifier format", () => {
  const result = validateCollectiveIdentifierNumber("not-an-iz");
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
