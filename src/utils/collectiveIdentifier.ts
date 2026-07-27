import { crc8Hex } from "./crc8";

const COLLECTIVE_IDENTIFIER_PATTERN =
  /^(\d{10})-IZ(\d{4})(0[1-9]|1[0-2])-([0-9A-F]{12})-([0-9A-F]{2})$/;

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
