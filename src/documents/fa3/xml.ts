import { KsefError } from "../../errors/errors";
import { validateFa3XmlXsd } from "./xsd";
import type { FA3Draft } from "./builder";

export class FA3XmlValidationError extends KsefError {
  constructor(message: string) {
    super(message);
    this.name = "FA3XmlValidationError";
  }
}

export function toFa3XmlValidationMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function validateFa3XmlWithValidator(
  xml: string,
  validator: (value: string) => Promise<void>,
): Promise<void> {
  try {
    await validator(xml);
  } catch (error) {
    throw new FA3XmlValidationError(toFa3XmlValidationMessage(error));
  }
}

export async function validateFa3Xml(xml: string): Promise<void> {
  return validateFa3XmlWithValidator(xml, validateFa3XmlXsd);
}

export async function invoiceToXml(
  draft: FA3Draft,
  options: { pretty?: boolean; xsdValidate?: boolean } = {},
): Promise<string> {
  return draft.toXml(options);
}

export const invoice_to_xml = invoiceToXml;
export const validate_fa3_xml_xsd = validateFa3XmlXsd;
