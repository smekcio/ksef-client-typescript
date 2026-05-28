import { KsefError } from "../../errors/errors";
import { validateFa3XmlXsd } from "./xsd";
import type { FA3Draft } from "./builder";

export class FA3XmlValidationError extends KsefError {
  constructor(message: string) {
    super(message);
    this.name = "FA3XmlValidationError";
  }
}

export async function validateFa3Xml(xml: string): Promise<void> {
  try {
    await validateFa3XmlXsd(xml);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new FA3XmlValidationError(message);
  }
}

export async function invoiceToXml(
  draft: FA3Draft,
  options: { pretty?: boolean; xsdValidate?: boolean } = {},
): Promise<string> {
  return draft.toXml(options);
}

export const invoice_to_xml = invoiceToXml;
export const validate_fa3_xml_xsd = validateFa3XmlXsd;
