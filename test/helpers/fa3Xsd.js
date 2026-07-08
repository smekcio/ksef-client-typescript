import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export function bundledFa3SchemaPath() {
  return path.join(packageRoot, "src", "xml", "fa3-schemas", "schemat_FA(3)_v1-0E.xsd");
}

export function rewriteBundledFa3SchemaLocations(content, schemaDirectory) {
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

export function loadBundledFa3Xsd(libxmljs) {
  const schemaPath = bundledFa3SchemaPath();
  const schemaDirectory = path.dirname(schemaPath);
  const schemaXml = rewriteBundledFa3SchemaLocations(
    fs.readFileSync(schemaPath, "utf8"),
    schemaDirectory,
  );
  return libxmljs.parseXml(schemaXml, {
    baseUrl: pathToFileURL(`${schemaDirectory}${path.sep}`).href,
  });
}

export function skipUnlessLibxml(libxmljs) {
  if (!libxmljs) {
    return "Missing optional libxmljs2 native binding.";
  }
  if (!fs.existsSync(bundledFa3SchemaPath())) {
    return `Missing bundled FA(3) schema: ${bundledFa3SchemaPath()}`;
  }
  return false;
}

export function validateXml(libxmljs, xml, xsdDoc) {
  const doc = libxmljs.parseXml(xml);
  const valid = doc.validate(xsdDoc);
  if (!valid) {
    const errors = doc.validationErrors.map((err) => err.message.trim()).join("\n");
    throw new Error(`XML validation failed:\n${errors}`);
  }
}
