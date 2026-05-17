import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { KsefError } from "../../errors/errors";

const SCHEMA_ENTRY = path.resolve(
  process.cwd(),
  "src",
  "documents",
  "fa3",
  "schemas",
  "schemat_FA(3)_v1-0E.xsd",
);

function loadSchemaWithLocalImports(): { schemaContent: string; schemaBaseUrl: string } {
  if (!fs.existsSync(SCHEMA_ENTRY)) {
    throw new KsefError(`Missing FA(3) schema file: ${SCHEMA_ENTRY}`);
  }
  const schemaBaseDir = path.dirname(SCHEMA_ENTRY);
  const bazowePath = path.join(schemaBaseDir, "bazowe", "StrukturyDanych_v10-0E.xsd");
  const bazoweUrl = pathToFileURL(bazowePath).href;
  const raw = fs.readFileSync(SCHEMA_ENTRY, "utf8");
  const schemaContent = raw.replace(
    /schemaLocation="http:\/\/crd\.gov\.pl\/xml\/schematy\/dziedzinowe\/mf\/2022\/01\/05\/eD\/DefinicjeTypy\/StrukturyDanych_v10-0E\.xsd"/g,
    `schemaLocation="${bazoweUrl}"`,
  );
  return {
    schemaContent,
    schemaBaseUrl: pathToFileURL(`${schemaBaseDir}${path.sep}`).href,
  };
}

export async function validateFa3XmlXsd(xml: string): Promise<void> {
  type ParsedXml = {
    validate: (schema: ParsedXml) => boolean;
    validationErrors?: Array<{ message?: string }>;
  };
  type LibxmlModule = {
    parseXml: (value: string, options?: { baseUrl?: string }) => ParsedXml;
  };
  let parseXml: LibxmlModule["parseXml"];
  try {
    const imported = await import("libxmljs2");
    parseXml = (imported as unknown as LibxmlModule).parseXml;
  } catch {
    throw new KsefError(
      "FA(3) XSD validation requires optional dependency `libxmljs2`. Install it and retry.",
    );
  }

  const { schemaContent, schemaBaseUrl } = loadSchemaWithLocalImports();
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
