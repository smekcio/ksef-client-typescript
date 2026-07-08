import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { XMLValidator } from "fast-xml-parser";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export function bundledFa3SchemaPath() {
  return path.join(packageRoot, "src", "xml", "fa3-schemas", "schemat_FA(3)_v1-0E.xsd");
}

export function validateWellFormed(xml) {
  const result = XMLValidator.validate(xml, { allowBooleanAttributes: true });
  if (result !== true) {
    const message = `line ${result.err.line}, col ${result.err.col}: ${result.err.msg}`;
    throw new Error(`XML validation failed:\n${message}`);
  }
}
