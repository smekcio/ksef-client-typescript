import { crc8Hex } from "./crc8";

export interface KsefNumberValidationResult {
  isValid: boolean;
  message?: string;
}

export function validateKsefNumber(ksefNumber: string): KsefNumberValidationResult {
  if (!ksefNumber) {
    return { isValid: false, message: "KSeF number is empty." };
  }

  let normalized = ksefNumber;
  if (normalized.length === 36) {
    const parts = normalized.split("-");
    if (parts.length === 5) {
      const [part0, part1, part2, part3, part4] = parts;
      if (!part0 || !part1 || !part2 || !part3 || !part4) {
        return { isValid: false, message: "Invalid KSeF number format." };
      }
      normalized = [part0, part1, part2 + part3, part4].join("-");
    } else {
      return { isValid: false, message: "Invalid KSeF number format." };
    }
  }

  if (normalized.length !== 35) {
    return { isValid: false, message: "KSeF number must be 35 characters long." };
  }
  const main = normalized.slice(0, 32);
  const checksum = normalized.slice(-2);
  const computed = crc8Hex(main);
  if (computed !== checksum) {
    return {
      isValid: false,
      message: `Invalid checksum. Expected ${computed}, got ${checksum}.`,
    };
  }
  return { isValid: true };
}
