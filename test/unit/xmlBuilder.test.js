import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { XMLParser } from "fast-xml-parser";
import { buildFakturaXml } from "../../dist/index.js";
import {
  buildMultiRateFa3FakturaInput,
  buildSampleFa3FakturaInput,
} from "../helpers/fa3InvoiceFixture.js";
import { loadBundledFa3Xsd, skipUnlessLibxml, validateXml } from "../helpers/fa3Xsd.js";

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
const libxmljs = await loadLibxml();
const skipFa2XsdTest =
  (missingFa2Fixture ? `Missing fixture: ${missingFa2Fixture}` : false) ||
  (libxmljs ? false : "Missing optional libxmljs2 native binding.");
const skipFa3XsdTest = skipUnlessLibxml(libxmljs);
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  parseAttributeValue: false,
});

async function loadLibxml() {
  try {
    return await import("libxmljs2");
  } catch {
    return undefined;
  }
}

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

test("FA2 XML builder produces XSD-valid XML", { skip: skipFa2XsdTest }, () => {
  const templateXml = loadTemplateXml(fa2TemplatePath);
  const faktura = parseFaktura(templateXml);
  const xml = buildFakturaXml(faktura, { schema: "FA2" });
  const xsd = loadXsd(xsdFa2Path);
  validateXml(libxmljs, xml, xsd);
});

test("FA3 XML builder produces XSD-valid XML", { skip: skipFa3XsdTest }, () => {
  const faktura = buildSampleFa3FakturaInput();
  const xml = buildFakturaXml(faktura, { schema: "FA3" });
  const xsd = loadBundledFa3Xsd(libxmljs);
  validateXml(libxmljs, xml, xsd);
});

test("FA2 XML builder validates a multi-rate invoice against XSD", { skip: skipFa2XsdTest }, () => {
  const faktura = makeMultiRateFaktura(fa2TemplatePath);
  const xml = buildFakturaXml(faktura, { schema: "FA2" });
  const xsd = loadXsd(xsdFa2Path);
  validateXml(libxmljs, xml, xsd);
});

test("FA3 XML builder validates a multi-rate invoice against XSD", { skip: skipFa3XsdTest }, () => {
  const faktura = buildMultiRateFa3FakturaInput();
  const xml = buildFakturaXml(faktura, { schema: "FA3" });
  const xsd = loadBundledFa3Xsd(libxmljs);
  validateXml(libxmljs, xml, xsd);
});
