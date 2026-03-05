import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as libxmljs from "libxmljs2";
import { XMLParser } from "fast-xml-parser";
import { buildPefXml, isPefUblDocumentInput, KsefValidationError } from "../../dist/index.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const workspaceRoot = path.resolve(packageRoot, "..");

const pefSchemaDir = path.join(workspaceRoot, "ksef-docs", "faktury", "schemy", "PEF");
const pef3XsdPath = path.join(pefSchemaDir, "Schemat_PEF(3)_v2-1.xsd");
const pefKor3XsdPath = path.join(pefSchemaDir, "Schemat_PEF_KOR(3)_v2-1.xsd");

const pef3TemplatePath = path.join(
  workspaceRoot,
  "ksef-client-csharp",
  "KSeF.Client.Tests.Core",
  "Templates",
  "invoice-template-fa-3-pef.xml",
);
const pefKor3TemplatePath = path.join(
  workspaceRoot,
  "ksef-client-csharp",
  "KSeF.Client.Tests.Core",
  "Templates",
  "invoice-template-fa-3-pef-correction.xml",
);
const requiredFixtures = [pef3XsdPath, pefKor3XsdPath, pef3TemplatePath, pefKor3TemplatePath];
const missingFixture = requiredFixtures.find((fixturePath) => !fs.existsSync(fixturePath));
const skipMissingFixture = missingFixture ? `Missing fixture: ${missingFixture}` : false;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  parseAttributeValue: false,
});

function loadXsd(schemaPath) {
  const baseDir = path.dirname(schemaPath);
  const content = fs.readFileSync(schemaPath, "utf8");
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

function loadTemplateXml(templatePath) {
  const xml = fs.readFileSync(templatePath, "utf8");
  return xml
    .replace(/#invoice_number#/g, "INV/1/2026")
    .replace(/#issue_date#/g, "2026-01-01")
    .replace(/#due_date#/g, "2026-01-15")
    .replace(/#buyer_reference#/g, "BR-1")
    .replace(/#supplier_nip#/g, "7770020410")
    .replace(/#buyer_nip#/g, "4598375937")
    .replace(/#iban#/g, "PL61109010140000071219812874");
}

function parseRoot(xml) {
  const parsed = xmlParser.parse(xml);
  const rootKey = Object.keys(parsed).find((key) => !key.startsWith("?"));
  if (!rootKey) {
    throw new Error("Expected a root element.");
  }
  const root = parsed[rootKey];
  if (!root || typeof root !== "object") {
    throw new Error("Expected a root object.");
  }
  return { rootKey, root };
}

function stripRootAttributes(root) {
  const clone = { ...root };
  for (const key of Object.keys(clone)) {
    if (key.startsWith("@_")) {
      delete clone[key];
    }
  }
  return clone;
}

test("PEF(3) XML builder produces XSD-valid XML", { skip: skipMissingFixture }, () => {
  const templateXml = loadTemplateXml(pef3TemplatePath);
  const { rootKey, root } = parseRoot(templateXml);
  if (rootKey !== "Invoice") {
    throw new Error(`Expected Invoice root element, got ${rootKey}.`);
  }
  const xml = buildPefXml({ Invoice: stripRootAttributes(root) });
  const xsd = loadXsd(pef3XsdPath);
  validateXml(xml, xsd);
});

test("PEF_KOR(3) XML builder produces XSD-valid XML", { skip: skipMissingFixture }, () => {
  const templateXml = loadTemplateXml(pefKor3TemplatePath);
  const { rootKey, root } = parseRoot(templateXml);
  const localRoot = rootKey.includes(":") ? rootKey.split(":").at(-1) : rootKey;
  if (localRoot !== "CreditNote") {
    throw new Error(`Expected CreditNote root element, got ${rootKey}.`);
  }
  const xml = buildPefXml({ CreditNote: stripRootAttributes(root) });
  const xsd = loadXsd(pefKor3XsdPath);
  validateXml(xml, xsd);
});

test("isPefUblDocumentInput accepts exactly one supported root object", () => {
  assert.equal(isPefUblDocumentInput({ Invoice: { ID: "1" } }), true);
  assert.equal(isPefUblDocumentInput({ CreditNote: { ID: "1" } }), true);
  assert.equal(isPefUblDocumentInput({ Invoice: { ID: "1" }, CreditNote: { ID: "2" } }), false);
  assert.equal(isPefUblDocumentInput({ Invoice: [] }), false);
});

test("buildPefXml throws validation error for schema/root mismatch", () => {
  assert.throws(
    () => buildPefXml({ schema: "PEF_KOR", Invoice: { ID: "1" } }),
    (error) => {
      assert.ok(error instanceof KsefValidationError);
      assert.match(error.message, /PEF schema mismatch/);
      return true;
    },
  );
});
