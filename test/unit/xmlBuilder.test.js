import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { XMLParser } from "fast-xml-parser";
import { buildFakturaXml } from "../../dist/index.js";
import {
  buildMultiRateFa3FakturaInput,
  buildSampleFa3FakturaInput,
} from "../helpers/fa3InvoiceFixture.js";
import { validateWellFormed } from "../helpers/fa3Xsd.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const workspaceRoot = path.resolve(packageRoot, "..");
const xsdBaseDir = path.join(workspaceRoot, "ksef-docs", "faktury", "schemy", "FA");
const xsdFa2Path = path.join(xsdBaseDir, "schemat_FA(2)_v1-0E.xsd");
const fa2TemplatePath = path.join(
  workspaceRoot,
  "ksef-client-csharp",
  "KSeF.Client.Tests",
  "Templates",
  "invoice-template-fa-2.xml",
);
const requiredFa2Fixtures = [xsdFa2Path, fa2TemplatePath];
const missingFa2Fixture = requiredFa2Fixtures.find((fixturePath) => !fs.existsSync(fixturePath));
const skipFa2Test = missingFa2Fixture ? `Missing fixture: ${missingFa2Fixture}` : false;
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

function makeMultiRateFaktura(templatePath) {
  const faktura = parseFaktura(loadTemplateXml(templatePath));
  faktura.Fa = {
    ...faktura.Fa,
    P_13_1: "916.00",
    P_14_1: "210.68",
    P_13_2: "46.00",
    P_14_2: "3.68",
    P_13_6_1: "20.00",
    P_15: "1180.36",
  };
  return faktura;
}

test("FA2 XML builder produces well-formed XML", { skip: skipFa2Test }, () => {
  const templateXml = loadTemplateXml(fa2TemplatePath);
  const faktura = parseFaktura(templateXml);
  const xml = buildFakturaXml(faktura, { schema: "FA2" });
  validateWellFormed(xml);
});

test("FA3 XML builder produces well-formed XML", () => {
  const faktura = buildSampleFa3FakturaInput();
  const xml = buildFakturaXml(faktura, { schema: "FA3" });
  validateWellFormed(xml);
});

test("FA2 XML builder validates a multi-rate invoice as well-formed XML", { skip: skipFa2Test }, () => {
  const faktura = makeMultiRateFaktura(fa2TemplatePath);
  const xml = buildFakturaXml(faktura, { schema: "FA2" });
  validateWellFormed(xml);
});

test("FA3 XML builder validates a multi-rate invoice as well-formed XML", () => {
  const faktura = buildMultiRateFa3FakturaInput();
  const xml = buildFakturaXml(faktura, { schema: "FA3" });
  validateWellFormed(xml);
});
