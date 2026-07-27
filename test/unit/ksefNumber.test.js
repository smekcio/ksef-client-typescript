import assert from "node:assert/strict";
import { test } from "node:test";
import { isValidKsefNumber, requireKsefNumber, validateKsefNumber } from "../../dist/index.js";

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

test("rejects empty KSeF number", () => {
  const result = validateKsefNumber("");
  assert.equal(result.isValid, false);
  assert.match(result.message, /empty/);
});

test("rejects malformed 36-char KSeF number with unexpected separators", () => {
  const malformed = "5265877635/20250826-0100001AF629-AF0";
  assert.equal(malformed.length, 36);
  const result = validateKsefNumber(malformed);
  assert.equal(result.isValid, false);
  assert.match(result.message, /Invalid KSeF number format/);
});

test("rejects malformed 36-char KSeF number with empty segment", () => {
  const malformed = "5265877635--20250826-0100001AF629-AF";
  assert.equal(malformed.length, 36);
  const result = validateKsefNumber(malformed);
  assert.equal(result.isValid, false);
  assert.match(result.message, /Invalid KSeF number format/);
});

test("accepts 36-char variant and normalizes middle segments before checksum validation", () => {
  const withExtraSeparator = "5265877635-20250826-0100001A-F629-AF";
  assert.equal(withExtraSeparator.length, 36);
  const result = validateKsefNumber(withExtraSeparator);
  assert.equal(result.isValid, true);
});

test("requireKsefNumber returns value or throws", () => {
  const valid = "5265877635-20250826-0100001AF629-AF";
  assert.equal(requireKsefNumber(valid), valid);
  assert.equal(isValidKsefNumber(valid), true);
  assert.throws(() => requireKsefNumber("bad"), /Invalid KSeF number/);
});

test("requireKsefNumber returns normalized 35-char form for 36-char input", () => {
  const withExtraSeparator = "5265877635-20250826-0100001A-F629-AF";
  assert.equal(withExtraSeparator.length, 36);
  assert.equal(requireKsefNumber(withExtraSeparator), "5265877635-20250826-0100001AF629-AF");
});
