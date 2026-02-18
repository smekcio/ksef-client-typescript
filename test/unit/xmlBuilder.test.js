import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as libxmljs from "libxmljs2";
import { XMLParser } from "fast-xml-parser";
import { buildFakturaXml } from "../../dist/index.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const workspaceRoot = path.resolve(packageRoot, "..");
const xsdBaseDir = path.join(workspaceRoot, "ksef-docs", "faktury", "schemy", "FA");
const xsdFa2Path = path.join(xsdBaseDir, "schemat_FA(2)_v1-0E.xsd");
const xsdFa3Path = path.join(xsdBaseDir, "schemat_FA(3)_v1-0E.xsd");
const fa2TemplatePath = path.join(
  workspaceRoot,
  "ksef-client-csharp",
  "KSeF.Client.Tests",
  "Templates",
  "invoice-template-fa-2.xml",
);
const fa3TemplatePath = path.join(
  workspaceRoot,
  "ksef-client-csharp",
  "KSeF.Client.Tests",
  "Templates",
  "invoice-template-fa-3.xml",
);
const requiredFixtures = [xsdFa2Path, xsdFa3Path, fa2TemplatePath, fa3TemplatePath];
const missingFixture = requiredFixtures.find((fixturePath) => !fs.existsSync(fixturePath));
const skipMissingFixture = missingFixture ? `Missing fixture: ${missingFixture}` : false;
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  parseAttributeValue: false,
});

function loadTemplateXml(templatePath) {
  const xml = fs.readFileSync(templatePath, "utf8");
  return xml.replace(/#nip#/g, "1111111111").replace(/#invoice_number#/g, "0001");
}

function parseFaktura(xml) {
  const parsed = xmlParser.parse(xml);
  const faktura = parsed?.Faktura;
  if (!faktura || typeof faktura !== "object") {
    throw new Error("Expected Faktura root element.");
  }
  for (const key of Object.keys(faktura)) {
    if (key.startsWith("@_xmlns")) {
      delete faktura[key];
    }
  }
  return faktura;
}

function loadXsd(schemaPath) {
  const baseDir = path.dirname(schemaPath);
  const bazowePath = path.join(baseDir, "bazowe", "StrukturyDanych_v10-0E.xsd");
  const bazoweUrl = pathToFileURL(bazowePath).href;
  let content = fs.readFileSync(schemaPath, "utf8");
  content = content.replace(
    /schemaLocation="http:\/\/crd\.gov\.pl\/xml\/schematy\/dziedzinowe\/mf\/2022\/01\/05\/eD\/DefinicjeTypy\/StrukturyDanych_v10-0E\.xsd"/g,
    `schemaLocation="${bazoweUrl}"`,
  );
  return libxmljs.parseXml(content, {
    baseUrl: pathToFileURL(baseDir + path.sep).href,
  });
}

function validateXml(xml, xsdDoc) {
  const doc = libxmljs.parseXml(xml);
  const valid = doc.validate(xsdDoc);
  if (!valid) {
    const errors = doc.validationErrors.map((err) => err.message.trim()).join("\n");
    throw new Error(`XML validation failed:\n${errors}`);
  }
}

test("FA2 XML builder produces XSD-valid XML", { skip: skipMissingFixture }, () => {
  const templateXml = loadTemplateXml(fa2TemplatePath);
  const faktura = parseFaktura(templateXml);
  const xml = buildFakturaXml(faktura, { schema: "FA2" });
  const xsd = loadXsd(xsdFa2Path);
  validateXml(xml, xsd);
});

test("FA3 XML builder produces XSD-valid XML", { skip: skipMissingFixture }, () => {
  const templateXml = loadTemplateXml(fa3TemplatePath);
  const faktura = parseFaktura(templateXml);
  const xml = buildFakturaXml(faktura, { schema: "FA3" });
  const xsd = loadXsd(xsdFa3Path);
  validateXml(xml, xsd);
});
