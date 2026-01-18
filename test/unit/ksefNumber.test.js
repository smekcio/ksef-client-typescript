import assert from "node:assert/strict";
import { test } from "node:test";
import { validateKsefNumber } from "../../dist/index.js";

test("validates KSeF number checksum", () => {
  const valid = "5265877635-20250826-0100001AF629-AF";
  const result = validateKsefNumber(valid);
  assert.equal(result.isValid, true);
});

test("rejects invalid checksum", () => {
  const invalid = "5265877635-20250826-0100001AF629-00";
  const result = validateKsefNumber(invalid);
  assert.equal(result.isValid, false);
});

test("rejects invalid length", () => {
  const result = validateKsefNumber("123");
  assert.equal(result.isValid, false);
});
