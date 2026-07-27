const CERTIFICATE_SERIAL_NUMBER_PATTERN = /^[0-9A-F]{16}$/;

export interface CertificateSerialValidationResult {
  isValid: boolean;
  message?: string;
}

export function validateCertificateSerialNumber(
  serialNumber: string,
): CertificateSerialValidationResult {
  if (!serialNumber) {
    return { isValid: false, message: "empty value" };
  }

  if (!CERTIFICATE_SERIAL_NUMBER_PATTERN.test(serialNumber)) {
    return { isValid: false, message: "invalid format" };
  }

  return { isValid: true, message: "ok" };
}

export function isValidCertificateSerialNumber(serialNumber: string): boolean {
  return validateCertificateSerialNumber(serialNumber).isValid;
}

export function requireCertificateSerialNumber(serialNumber: string): string {
  const result = validateCertificateSerialNumber(serialNumber);
  if (!result.isValid) {
    throw new Error(`Invalid certificate serial number: ${result.message}`);
  }
  return serialNumber;
}
