import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { KsefValidationError } from "../errors/errors";

type LibxmlDocument = {
  validate(schema: LibxmlDocument): boolean;
  validationErrors: Array<{ message?: string; line?: number; column?: number }>;
};

type LibxmlModule = {
  parseXml(xml: string | Buffer, options?: { baseUrl?: string }): LibxmlDocument;
};

export class XsdValidationError extends KsefValidationError {
  readonly validationErrors: string[];

  constructor(message: string, validationErrors: string[] = []) {
    super(message);
    this.name = "XsdValidationError";
    this.validationErrors = validationErrors;
  }
}

export interface XsdValidationOptions {
  schemaPath?: string;
  schemaDirectory?: string;
}

export async function validateFa3XmlXsd(
  xml: string | Buffer,
  options: XsdValidationOptions = {},
): Promise<void> {
  const libxmljs = await loadLibxml();
  const schemaPath = options.schemaPath ?? resolveFa3SchemaPath(options.schemaDirectory);
  const schemaDirectory = path.dirname(schemaPath);
  const schemaXml = rewriteSchemaLocations(fs.readFileSync(schemaPath, "utf8"), schemaDirectory);
  const schema = libxmljs.parseXml(schemaXml, {
    baseUrl: pathToFileURL(`${schemaDirectory}${path.sep}`).href,
  });
  const document = libxmljs.parseXml(xml);
  if (!document.validate(schema)) {
    const errors = document.validationErrors.map(formatValidationError);
    throw new XsdValidationError(`FA(3) XML validation failed:\n${errors.join("\n")}`, errors);
  }
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

async function loadLibxml(): Promise<LibxmlModule> {
  try {
    return (await import("libxmljs2")) as LibxmlModule;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new KsefValidationError(
      `FA(3) XSD validation requires optional dependency libxmljs2 with native bindings. ${detail}`,
    );
  }
}

function rewriteSchemaLocations(content: string, schemaDirectory: string): string {
  return content
    .replace(
      /schemaLocation="http:\/\/crd\.gov\.pl\/xml\/schematy\/dziedzinowe\/mf\/2022\/01\/05\/eD\/DefinicjeTypy\/StrukturyDanych_v10-0E\.xsd"/g,
      `schemaLocation="${pathToFileURL(path.join(schemaDirectory, "StrukturyDanych_v10-0E.xsd")).href}"`,
    )
    .replace(
      /schemaLocation="http:\/\/crd\.gov\.pl\/xml\/schematy\/dziedzinowe\/mf\/2022\/01\/05\/eD\/DefinicjeTypy\/ElementarneTypyDanych_v10-0E\.xsd"/g,
      `schemaLocation="${pathToFileURL(path.join(schemaDirectory, "ElementarneTypyDanych_v10-0E.xsd")).href}"`,
    )
    .replace(
      /schemaLocation="http:\/\/crd\.gov\.pl\/xml\/schematy\/dziedzinowe\/mf\/2022\/01\/05\/eD\/DefinicjeTypy\/KodyKrajow_v10-0E\.xsd"/g,
      `schemaLocation="${pathToFileURL(path.join(schemaDirectory, "KodyKrajow_v10-0E.xsd")).href}"`,
    );
}

function formatValidationError(error: { message?: string; line?: number; column?: number }): string {
  const location =
    error.line !== undefined || error.column !== undefined
      ? `line ${error.line ?? "?"}, column ${error.column ?? "?"}: `
      : "";
  return `${location}${error.message ?? "unknown validation error"}`.trim();
}
