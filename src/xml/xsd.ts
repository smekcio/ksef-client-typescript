import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { XMLValidator } from "fast-xml-parser";

import { KsefValidationError } from "../errors/errors";

export class XmlWellFormedError extends KsefValidationError {
  readonly validationErrors: string[];

  constructor(message: string, validationErrors: string[] = []) {
    super(message);
    this.name = "XmlWellFormedError";
    this.validationErrors = validationErrors;
  }
}

/** @deprecated Use {@link XmlWellFormedError} instead. */
export class XsdValidationError extends XmlWellFormedError {
  constructor(message: string, validationErrors: string[] = []) {
    super(message, validationErrors);
    this.name = "XsdValidationError";
  }
}

export interface XmlWellFormedOptions {
  allowBooleanAttributes?: boolean;
}

/** @deprecated Use {@link XmlWellFormedOptions} instead. */
export type XsdValidationOptions = XmlWellFormedOptions;

export async function validateFa3XmlWellFormed(
  xml: string | Buffer,
  options: XmlWellFormedOptions = {},
): Promise<void> {
  const text = Buffer.isBuffer(xml) ? xml.toString("utf8") : xml;
  const result = XMLValidator.validate(text, {
    allowBooleanAttributes: options.allowBooleanAttributes ?? true,
  });
  if (result !== true) {
    const message = `line ${result.err.line}, col ${result.err.col}: ${result.err.msg}`;
    throw new XmlWellFormedError(`FA(3) XML is not well-formed:\n${message}`, [message]);
  }
}

/** @deprecated Use {@link validateFa3XmlWellFormed} instead. Checks XML well-formedness only, not XSD schema conformance. */
export async function validateFa3XmlXsd(
  xml: string | Buffer,
  options: XmlWellFormedOptions = {},
): Promise<void> {
  return validateFa3XmlWellFormed(xml, options);
}

export function resolveFa3SchemaPath(schemaDirectory?: string): string {
  if (schemaDirectory) {
    return path.join(schemaDirectory, "schemat_FA(3)_v1-0E.xsd");
  }
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(moduleDir, "fa3-schemas", "schemat_FA(3)_v1-0E.xsd"),
    path.join(moduleDir, "..", "src", "xml", "fa3-schemas", "schemat_FA(3)_v1-0E.xsd"),
    path.join(process.cwd(), "src", "xml", "fa3-schemas", "schemat_FA(3)_v1-0E.xsd"),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new KsefValidationError("FA(3) XSD schemas were not found in the package.");
  }
  return found;
}
