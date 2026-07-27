import { crc8Hex } from "./crc8";

export interface KsefNumberValidationResult {
  isValid: boolean;
  message?: string;
}

type NormalizeResult =
  | { ok: true; value: string }
  | { ok: false; message: string };

function normalizeAndValidateKsefNumber(ksefNumber: string): NormalizeResult {
  if (!ksefNumber) {
    return { ok: false, message: "KSeF number is empty." };
  }

  let normalized = ksefNumber;
  if (normalized.length === 36) {
    const parts = normalized.split("-");
    if (parts.length === 5) {
      const [part0, part1, part2, part3, part4] = parts;
      if (!part0 || !part1 || !part2 || !part3 || !part4) {
        return { ok: false, message: "Invalid KSeF number format." };
      }
      normalized = [part0, part1, part2 + part3, part4].join("-");
    } else {
      return { ok: false, message: "Invalid KSeF number format." };
    }
  }

  if (normalized.length !== 35) {
    return { ok: false, message: "KSeF number must be 35 characters long." };
  }
  const main = normalized.slice(0, 32);
  const checksum = normalized.slice(-2);
  const computed = crc8Hex(main);
  if (computed !== checksum) {
    return {
      ok: false,
      message: `Invalid checksum. Expected ${computed}, got ${checksum}.`,
    };
  }
  return { ok: true, value: normalized };
}

export function validateKsefNumber(ksefNumber: string): KsefNumberValidationResult {
  const result = normalizeAndValidateKsefNumber(ksefNumber);
  if (!result.ok) {
    return { isValid: false, message: result.message };
  }
  return { isValid: true };
}

export function isValidKsefNumber(ksefNumber: string): boolean {
  return validateKsefNumber(ksefNumber).isValid;
}

export function requireKsefNumber(ksefNumber: string): string {
  const result = normalizeAndValidateKsefNumber(ksefNumber);
  if (!result.ok) {
    throw new Error(`Invalid KSeF number: ${result.message}`);
  }
  return result.value;
}
