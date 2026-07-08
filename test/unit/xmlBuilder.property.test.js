import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { XMLParser } from "fast-xml-parser";
import fc from "fast-check";
import { buildFakturaXml, FA3Invoice, FA3Party } from "../../dist/index.js";
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

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function formatMoney(value) {
  return value.toFixed(2);
}

function makeVariant(template, variant) {
  const faktura = structuredClone(template);

  faktura.Fa.P_2 = `FA/PROP/${variant.invoiceNo}/01/2026`;
  faktura.Fa.P_13_1 = formatMoney(variant.net);
  faktura.Fa.P_14_1 = formatMoney(variant.vat);
  faktura.Fa.P_15 = formatMoney(variant.gross);

  const baseRow = asArray(faktura.Fa.FaWiersz)[0];
  if (!baseRow) {
    throw new Error("Template does not contain FaWiersz.");
  }

  const rows = [];
  for (let i = 0; i < variant.rows.length; i += 1) {
    const r = structuredClone(baseRow);
    r.NrWierszaFa = String(i + 1);
    r.UU_ID = variant.rows[i].uuid;
    r.P_7 = variant.rows[i].name;
    r.P_8B = String(variant.rows[i].qty);
    r.P_9A = formatMoney(variant.rows[i].unitNet);
    r.P_11 = formatMoney(variant.rows[i].lineNet);
    rows.push(r);
  }
  faktura.Fa.FaWiersz = rows;

  return faktura;
}

function makeFa3Variant(variant) {
  const seller = FA3Party.polishCompany({
    nip: "1111111111",
    name: "Sprzedawca Sp. z o.o.",
    address: "Prosta 1",
  });
  const buyer = FA3Party.polishCompany({
    nip: "2222222222",
    name: "Nabywca S.A.",
    address: "Jasna 2",
  });
  const builder = FA3Invoice.basic(`FA/PROP/${variant.invoiceNo}/01/2026`)
    .seller(seller)
    .buyer(buyer)
    .issueDate("2026-05-16")
    .saleDate("2026-05-15");

  for (const row of variant.rows) {
    builder.addLine({
      description: row.name,
      quantity: String(row.qty),
      unitNetPrice: row.unitNet.toFixed(2),
      tax: "23",
      identifiers: { uniqueId: row.uuid },
      netAmount: row.lineNet.toFixed(2),
    });
  }

  return builder.build().toFakturaInput();
}

function propertyTest(schema, templatePath, xsdPath, skipReason) {
  const moneyArb = fc.integer({ min: 1, max: 1_000_000 }).map((v) => v / 100);
  const rowNameArb = fc
    .stringOf(
      fc.constantFrom(
        ..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 -_./()".split(""),
      ),
      {
        minLength: 1,
        maxLength: 40,
      },
    )
    .map((s) => s.trim() || "Usluga");

  const variantArb = fc.record({
    invoiceNo: fc.integer({ min: 1, max: 999_999 }),
    net: moneyArb,
    vat: moneyArb,
    gross: moneyArb,
    rows: fc.array(
      fc.record({
        uuid: fc.uuid(),
        name: rowNameArb,
        qty: fc.integer({ min: 1, max: 100 }),
        unitNet: moneyArb,
        lineNet: moneyArb,
      }),
      { minLength: 1, maxLength: 5 },
    ),
  });

  test(
    `property: ${schema} builder produces XSD-valid XML for many variants`,
    { skip: skipReason },
    async () => {
      const template = parseFaktura(loadTemplateXml(templatePath));
      const xsd = loadXsd(xsdPath);
      await fc.assert(
        fc.asyncProperty(variantArb, async (variant) => {
          const faktura = makeVariant(template, variant);
          const xml = buildFakturaXml(faktura, { schema });
          validateXml(libxmljs, xml, xsd);
        }),
        { numRuns: 25 },
      );
    },
  );
}

function propertyTestFa3(skipReason) {
  const moneyArb = fc.integer({ min: 1, max: 1_000_000 }).map((v) => v / 100);
  const rowNameArb = fc
    .stringOf(
      fc.constantFrom(
        ..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 -_./()".split(""),
      ),
      {
        minLength: 1,
        maxLength: 40,
      },
    )
    .map((s) => s.trim() || "Usluga");

  const variantArb = fc.record({
    invoiceNo: fc.integer({ min: 1, max: 999_999 }),
    net: moneyArb,
    vat: moneyArb,
    gross: moneyArb,
    rows: fc.array(
      fc.record({
        uuid: fc.uuid(),
        name: rowNameArb,
        qty: fc.integer({ min: 1, max: 100 }),
        unitNet: moneyArb,
        lineNet: moneyArb,
      }),
      { minLength: 1, maxLength: 5 },
    ),
  });

  test(
    "property: FA3 builder produces XSD-valid XML for many variants",
    { skip: skipReason },
    async () => {
      const xsd = loadBundledFa3Xsd(libxmljs);
      await fc.assert(
        fc.asyncProperty(variantArb, async (variant) => {
          const faktura = makeFa3Variant(variant);
          const xml = buildFakturaXml(faktura, { schema: "FA3" });
          validateXml(libxmljs, xml, xsd);
        }),
        { numRuns: 25 },
      );
    },
  );
}

propertyTest("FA2", fa2TemplatePath, xsdFa2Path, skipFa2XsdTest);
propertyTestFa3(skipFa3XsdTest);
