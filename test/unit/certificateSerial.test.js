import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isValidCertificateSerialNumber,
  requireCertificateSerialNumber,
  validateCertificateSerialNumber,
} from "../../dist/index.js";

const VALID_SERIAL = "0123456789ABCDEF";

test("validates certificate serial number", () => {
  const result = validateCertificateSerialNumber(VALID_SERIAL);
  assert.equal(result.isValid, true);
  assert.equal(isValidCertificateSerialNumber(VALID_SERIAL), true);
});

test("rejects empty certificate serial number", () => {
  const result = validateCertificateSerialNumber("");
  assert.equal(result.isValid, false);
  assert.match(result.message, /empty/);
});

test("rejects invalid certificate serial format", () => {
  const result = validateCertificateSerialNumber("abc");
  assert.equal(result.isValid, false);
  assert.match(result.message, /invalid format/);
});

test("rejects lowercase certificate serial", () => {
  const result = validateCertificateSerialNumber("0123456789abcdef");
  assert.equal(result.isValid, false);
  assert.match(result.message, /invalid format/);
});

test("requireCertificateSerialNumber returns value or throws", () => {
  assert.equal(requireCertificateSerialNumber(VALID_SERIAL), VALID_SERIAL);
  assert.throws(() => requireCertificateSerialNumber("bad"), /Invalid certificate serial number/);
});
