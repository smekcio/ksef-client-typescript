import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { KsefError } from "../../errors/errors";

const SCHEMA_FILE = "schemat_FA(3)_v1-0E.xsd";
const SCHEMA_IMPORT = "http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2022/01/05/eD/DefinicjeTypy/StrukturyDanych_v10-0E.xsd";

function moduleDir(): string {
  return path.dirname(fileURLToPath(import.meta.url));
}

export function resolveFa3SchemaEntryPath(candidates?: string[]): string {
  const localDir = moduleDir();
  const searchPaths = candidates ?? [
    path.join(localDir, "schemas", SCHEMA_FILE),
    path.join(localDir, "documents", "fa3", "schemas", SCHEMA_FILE),
    path.resolve(process.cwd(), "dist", "documents", "fa3", "schemas", SCHEMA_FILE),
    path.resolve(process.cwd(), "src", "documents", "fa3", "schemas", SCHEMA_FILE),
  ];
  const schemaPath = searchPaths.find((candidate) => fs.existsSync(candidate));
  if (!schemaPath) {
    throw new KsefError(`Missing FA(3) schema file. Checked: ${searchPaths.join(", ")}`);
  }
  return schemaPath;
}

export function loadFa3SchemaWithLocalImports(): { schemaContent: string; schemaBaseUrl: string; schemaPath: string } {
  const schemaPath = resolveFa3SchemaEntryPath();
  const schemaBaseDir = path.dirname(schemaPath);
  const bazowePath = path.join(schemaBaseDir, "bazowe", "StrukturyDanych_v10-0E.xsd");
  const bazoweUrl = pathToFileURL(bazowePath).href;
  const raw = fs.readFileSync(schemaPath, "utf8");
  const schemaContent = raw.replace(
    new RegExp(`schemaLocation="${SCHEMA_IMPORT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`, "g"),
    `schemaLocation="${bazoweUrl}"`,
  );
  return {
    schemaContent,
    schemaBaseUrl: pathToFileURL(`${schemaBaseDir}${path.sep}`).href,
    schemaPath,
  };
}

type Fa3XmlParser = (
  value: string,
  options?: { baseUrl?: string },
) => {
  validate: (schema: unknown) => boolean;
  validationErrors?: Array<{ message?: string }>;
};

export async function validateFa3XmlWithParser(xml: string, parseXml: Fa3XmlParser): Promise<void> {
  const { schemaContent, schemaBaseUrl } = loadFa3SchemaWithLocalImports();
  const schemaDoc = parseXml(schemaContent, { baseUrl: schemaBaseUrl });
  const xmlDoc = parseXml(xml);
  const valid = xmlDoc.validate(schemaDoc);
  if (!valid) {
    const errors = (xmlDoc.validationErrors ?? [])
      .map((err: { message?: string }) => String(err?.message ?? "").trim())
      .filter(Boolean);
    throw new KsefError(
      errors.length > 0 ? `FA(3) XSD validation failed: ${errors.join(" | ")}` : "FA(3) XSD validation failed.",
    );
  }
}

export type Libxml = { parseXml: Fa3XmlParser };

export async function loadLibxml(): Promise<Libxml> {
  // Indirect specifier keeps `libxmljs2` a runtime-only optional dependency:
  // it must not be resolved at compile time (typecheck / dts build) because
  // the native module is frequently absent (skipped optional install).
  const moduleName: string = "libxmljs2";
  return (await import(moduleName)) as unknown as Libxml;
}

export async function validateFa3XmlXsd(
  xml: string,
  loadModule: () => Promise<Libxml> = loadLibxml,
): Promise<void> {
  let parseXml: Fa3XmlParser;
  try {
    const imported = await loadModule();
    parseXml = imported.parseXml;
  } catch {
    throw new KsefError(
      "FA(3) XSD validation requires optional dependency `libxmljs2`. Install with `npm install libxmljs2` and retry.",
    );
  }

  await validateFa3XmlWithParser(xml, parseXml);
}
