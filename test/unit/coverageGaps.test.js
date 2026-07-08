import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { test } from "node:test";

import {
  FA3BatchDraft,
  FA3Draft,
  FA3Importer,
  FA3Invoice,
  ImportMode,
  InvoiceParty,
  PartyIdentifierKind,
  auditFa3XsdCoverage,
  CoverageStatus,
  mapPartyIdentityToXml,
  parseFa3XsdElements,
  validatePartyIdentifier,
  resolvePartyIdentifier,
  resolveFa3SchemaEntryPath,
  validateFa3XmlXsd,
  XsdElement,
} from "../../dist/index.js";

const SELLER = { name: "Sprzedawca Sp. z o.o.", taxId: "1111111111", addressLine1: "ul. A 1, 00-001 Warszawa" };
const BUYER = { name: "Nabywca Sp. z o.o.", taxId: "2222222222", addressLine1: "ul. B 2, 00-002 Warszawa" };
const LINE = { description: "Usługa", quantity: 1, unit: "szt", unitNetPrice: 100, vatRate: 23 };

function basicBuilder(number = "FV/1") {
  return FA3Invoice.basic(number).issueDate("2026-01-15").seller(SELLER).buyer(BUYER).addLine(LINE);
}

// ---------------------------------------------------------------------------
// xml.ts + xsd.ts helpers (Node 20 compatible — no mock.module)
// ---------------------------------------------------------------------------
test("xml.ts: toFa3XmlValidationMessage handles Error and non-Error values", async () => {
  const { toFa3XmlValidationMessage, validateFa3XmlWithValidator, FA3XmlValidationError } = await import(
    "../../dist/documents/fa3.js"
  );
  assert.equal(toFa3XmlValidationMessage(new Error("boom")), "boom");
  assert.equal(toFa3XmlValidationMessage("string-boom"), "string-boom");
  await validateFa3XmlWithValidator("<Faktura/>", async () => undefined);
  await assert.rejects(
    () => validateFa3XmlWithValidator("<Faktura/>", async () => {
      throw "string-boom";
    }),
    (error) => error instanceof FA3XmlValidationError && error.message === "string-boom",
  );
});

test("xsd.ts: resolveFa3SchemaEntryPath throws for empty candidate list", () => {
  assert.throws(() => resolveFa3SchemaEntryPath([]), /Missing FA\(3\) schema file/);
});

test("xsd.ts: validateFa3XmlWithParser covers validation branches", async () => {
  const { validateFa3XmlWithParser } = await import("../../dist/documents/fa3.js");
  const validParser = () => ({
    validate: () => true,
    validationErrors: [],
  });
  await validateFa3XmlWithParser("<Faktura/>", validParser);

  const invalidParser = () => ({
    validate: () => false,
    validationErrors: [{ message: "bad element" }, { message: "" }],
  });
  await assert.rejects(() => validateFa3XmlWithParser("<Faktura/>", invalidParser), /bad element/);

  const emptyErrorsParser = () => ({
    validate: () => false,
    validationErrors: [],
  });
  await assert.rejects(
    () => validateFa3XmlWithParser("<Faktura/>", emptyErrorsParser),
    /FA\(3\) XSD validation failed\.$/,
  );

  const undefinedErrorsParser = () => ({
    validate: () => false,
  });
  await assert.rejects(
    () => validateFa3XmlWithParser("<Faktura/>", undefinedErrorsParser),
    /FA\(3\) XSD validation failed\.$/,
  );

  const nullishMessagesParser = () => ({
    validate: () => false,
    validationErrors: [null, {}, { message: undefined }],
  });
  await assert.rejects(
    () => validateFa3XmlWithParser("<Faktura/>", nullishMessagesParser),
    /FA\(3\) XSD validation failed\.$/,
  );
});

test("xsd.ts: validateFa3XmlXsd success and error via injected loader", async () => {
  const { validateFa3XmlWithParser } = await import("../../dist/documents/fa3.js");
  const validParser = () => ({ validate: () => true });
  await validateFa3XmlWithParser("<Faktura/>", validParser);
  await validateFa3XmlXsd("<Faktura/>", async () => ({ parseXml: validParser }));

  await assert.rejects(
    () => validateFa3XmlXsd("<Faktura/>", async () => {
      throw new Error("no module");
    }),
    /libxmljs2/,
  );
});

test("xsd.ts: loadLibxml resolves or throws consistently", async () => {
  const { loadLibxml } = await import("../../dist/documents/fa3.js");
  try {
    const mod = await loadLibxml();
    assert.equal(typeof mod.parseXml, "function");
  } catch (error) {
    assert.ok(error instanceof Error);
  }
});

test("xsd.ts: validateFa3XmlXsd throws when libxmljs2 missing", async () => {
  let hasLibxml = false;
  try {
    await import("libxmljs2");
    hasLibxml = true;
  } catch {
    hasLibxml = false;
  }
  if (hasLibxml) {
    return;
  }
  await assert.rejects(() => validateFa3XmlXsd("<Faktura/>"), /libxmljs2/);
});

test("xsd.ts: validateFa3XmlXsd with libxmljs2 when available", async () => {
  let hasLibxml = false;
  try {
    await import("libxmljs2");
    hasLibxml = true;
  } catch {
    hasLibxml = false;
  }
  if (!hasLibxml) {
    return;
  }
  const validXml = await FA3Invoice.basic("FV/XSD/OK")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine(LINE)
    .toXml();
  await validateFa3XmlXsd(validXml);
  await assert.rejects(() => validateFa3XmlXsd("<Faktura></Faktura>"), /XSD validation failed/);
});

// ---------------------------------------------------------------------------
// xsdMap.ts synthetic fragments
// ---------------------------------------------------------------------------
test("xsdMap.ts: synthetic schema fragments cover parser branches", () => {
  const withEnum = `
    <schema xmlns="http://www.w3.org/2001/XMLSchema">
      <simpleType><restriction base="xs:string"><enumeration value="A"/></restriction></simpleType>
      <simpleType name="Status"><restriction base="xs:string"><enumeration value="OK"/></restriction></simpleType>
      <element name="Faktura">
        <complexType>
          <sequence>
            <element name="Child" type="Status" minOccurs="0" maxOccurs="unbounded"/>
          </sequence>
        </complexType>
      </element>
    </schema>`;
  const parsed = parseFa3XsdElements(withEnum);
  assert.ok(parsed.some((entry) => entry.path === "/Faktura/Child"));
  assert.deepEqual(parsed.find((entry) => entry.path === "/Faktura/Child")?.enumValues, ["OK"]);

  const noNameSimpleType = `
    <schema xmlns="http://www.w3.org/2001/XMLSchema">
      <simpleType><restriction base="xs:string"><enumeration value="X"/></restriction></simpleType>
      <element name="Faktura"><complexType><sequence/></complexType></element>
    </schema>`;
  assert.equal(parseFa3XsdElements(noNameSimpleType).length, 1);

  const enumWithoutValue = `
    <schema xmlns="http://www.w3.org/2001/XMLSchema">
      <simpleType name="S"><restriction base="xs:string"><enumeration/></restriction></simpleType>
      <element name="Faktura"><complexType><sequence><element name="X" type="S"/></sequence></complexType></element>
    </schema>`;
  const enumParsed = parseFa3XsdElements(enumWithoutValue);
  assert.deepEqual(enumParsed.find((entry) => entry.path === "/Faktura/X")?.enumValues, []);
});

// ---------------------------------------------------------------------------
// xsdAudit.ts synthetic elements
// ---------------------------------------------------------------------------
test("xsdAudit.ts: synthetic elements cover raw extension and transport handlers", () => {
  const synthetic = [
    new XsdElement({ path: "/Faktura/Fa/RawXmlExtension", name: "RawXmlExtension" }),
    new XsdElement({ path: "/Faktura/Fa/Transport", name: "Transport" }),
    new XsdElement({ path: "/Faktura/Fa/Transport/RodzajTransportu", name: "RodzajTransportu" }),
    new XsdElement({ path: "/Faktura/Unknown/Field", name: "Field" }),
  ];
  const report = auditFa3XsdCoverage({ elements: synthetic });
  assert.equal(report.coverage.find((entry) => entry.path.includes("RawXmlExtension"))?.status, CoverageStatus.RAW_EXTENSION);
  assert.equal(report.coverage.find((entry) => entry.path === "/Faktura/Fa/Transport")?.handler, "mapTransport");
  assert.equal(report.coverage.find((entry) => entry.path === "/Faktura/Unknown/Field")?.handler, undefined);
});

// ---------------------------------------------------------------------------
// importer.ts non-Error catch branches
// ---------------------------------------------------------------------------
test("importer.ts: non-Error JSON parse and row failures use String(error)", () => {
  const originalParse = JSON.parse;
  try {
    JSON.parse = () => {
      throw "json-string-boom";
    };
    const parsed = FA3Importer.fromJson('{"drafts":[]}');
    assert.match(parsed.errors[0]?.message ?? "", /json-string-boom/);
  } finally {
    JSON.parse = originalParse;
  }

  const throwingRow = {
    issueDate: "2026-01-15",
    seller: SELLER,
    buyer: BUYER,
    lines: [LINE],
  };
  Object.defineProperty(throwingRow, "invoiceNumber", {
    configurable: true,
    get() {
      throw "row-string-boom";
    },
  });
  const rowResult = FA3Importer.fromJson({ drafts: [throwingRow] });
  assert.match(rowResult.invalidRows[0]?.message ?? "", /row-string-boom/);
  assert.throws(
    () => FA3Importer.fromJson({ drafts: [throwingRow] }, { mode: ImportMode.FAIL_FAST }),
    /row-string-boom/,
  );
});

// ---------------------------------------------------------------------------
// identifier.ts branches via builder
// ---------------------------------------------------------------------------
test("identifier.ts: EU/foreign/internal/none/default identifier branches", () => {
  const euEmpty = new FA3Draft({
    invoiceNumber: "FV/EU/0",
    issueDate: "2026-01-15",
    seller: SELLER,
    buyer: { name: "EU", taxId: "DE123", countryCode: "DE", identifier: { kind: PartyIdentifierKind.EU_VAT, value: "" } },
    lines: [LINE],
  });
  assert.equal(euEmpty.toFakturaInput().Podmiot2.DaneIdentyfikacyjne.NrVatUE, "");

  const foreignNoCountry = new FA3Draft({
    invoiceNumber: "FV/FGN/0",
    issueDate: "2026-01-15",
    seller: SELLER,
    buyer: { name: "Foreign", taxId: "ABC", identifier: { kind: PartyIdentifierKind.FOREIGN, value: "ABC" } },
    lines: [LINE],
  });
  assert.equal(foreignNoCountry.toFakturaInput().Podmiot2.DaneIdentyfikacyjne.NrID, "ABC");
  assert.equal(foreignNoCountry.toFakturaInput().Podmiot2.DaneIdentyfikacyjne.KodKraju, undefined);

  const internal = new FA3Draft({
    invoiceNumber: "FV/INT/0",
    issueDate: "2026-01-15",
    seller: SELLER,
    buyer: { name: "Internal", taxId: "X", identifier: { kind: PartyIdentifierKind.INTERNAL, value: "" } },
    lines: [LINE],
  });
  assert.equal(internal.toFakturaInput().Podmiot2.DaneIdentyfikacyjne.IDWew, "");

  const none = InvoiceParty.withoutTaxId({ name: "Anon" });
  const noneDraft = new FA3Draft({
    invoiceNumber: "FV/N/0",
    issueDate: "2026-01-15",
    seller: SELLER,
    buyer: none,
    lines: [LINE],
  });
  assert.equal(noneDraft.toFakturaInput().Podmiot2.DaneIdentyfikacyjne.BrakID, "1");

  const defaultKind = new FA3Draft({
    invoiceNumber: "FV/DEF/0",
    issueDate: "2026-01-15",
    seller: SELLER,
    buyer: { name: "Def", taxId: "X", identifier: { kind: "CUSTOM", value: "9" } },
    lines: [LINE],
  });
  assert.equal(defaultKind.toFakturaInput().Podmiot2.DaneIdentyfikacyjne.NIP, "9");

  const plDefaultCountry = new FA3Draft({
    invoiceNumber: "FV/PL/0",
    issueDate: "2026-01-15",
    seller: SELLER,
    buyer: { name: "PL", taxId: "3333333333" },
    lines: [LINE],
  });
  assert.equal(plDefaultCountry.toFakturaInput().Podmiot2.DaneIdentyfikacyjne.NIP, "3333333333");

  assert.deepEqual(
    mapPartyIdentityToXml({ kind: PartyIdentifierKind.EU_VAT, countryCode: "DE", value: "1" }, "EU", "buyer"),
    { KodUE: "DE", NrVatUE: "1", Nazwa: "EU" },
  );
  assert.deepEqual(
    mapPartyIdentityToXml({ kind: PartyIdentifierKind.FOREIGN, value: "X" }, "F", "buyer"),
    { NrID: "X", Nazwa: "F" },
  );
  assert.deepEqual(
    mapPartyIdentityToXml({ kind: PartyIdentifierKind.INTERNAL, value: "I" }, "Int", "buyer"),
    { IDWew: "I", Nazwa: "Int" },
  );

  assert.equal(resolvePartyIdentifier({ name: "PL", taxId: "1111111111" }).kind, PartyIdentifierKind.NIP);
  assert.equal(resolvePartyIdentifier({ name: "EU", taxId: "DE123", countryCode: "DE" }).kind, PartyIdentifierKind.EU_VAT);
  assert.equal(resolvePartyIdentifier({ name: "Int", taxId: "X", internalId: "IN-1" }).kind, PartyIdentifierKind.INTERNAL);
  assert.equal(resolvePartyIdentifier({ name: "None", taxId: "BRAK" }).kind, PartyIdentifierKind.NONE);
  assert.equal(resolvePartyIdentifier({ name: "US", taxId: "US:999" }).kind, PartyIdentifierKind.FOREIGN);
});

test("identifier.ts: validatePartyIdentifier validation branches", () => {
  assert.deepEqual(validatePartyIdentifier({ kind: PartyIdentifierKind.NONE, value: "" }, "party"), []);
  assert.ok(
    validatePartyIdentifier({ kind: PartyIdentifierKind.NIP, value: "  " }, "party").some(
      (issue) => issue.code === "identifier_required",
    ),
  );
  assert.ok(
    validatePartyIdentifier({ kind: PartyIdentifierKind.EU_VAT, value: "1", countryCode: "  " }, "party").some(
      (issue) => issue.code === "eu_vat_country_required",
    ),
  );
  assert.ok(
    validatePartyIdentifier({ kind: PartyIdentifierKind.EU_VAT, value: undefined, countryCode: "DE" }, "party").some(
      (issue) => issue.code === "identifier_required",
    ),
  );

  assert.deepEqual(
    mapPartyIdentityToXml({ kind: PartyIdentifierKind.EU_VAT, value: "1" }, "EU", "buyer"),
    { KodUE: "", NrVatUE: "1", Nazwa: "EU" },
  );
  assert.deepEqual(
    mapPartyIdentityToXml({ kind: PartyIdentifierKind.NIP, value: "123" }, "Seller", "seller"),
    { NIP: "123", Nazwa: "Seller" },
  );

  assert.deepEqual(
    mapPartyIdentityToXml({ kind: PartyIdentifierKind.NIP }, "SellerNoVal", "seller"),
    { NIP: "", Nazwa: "SellerNoVal" },
  );
  assert.deepEqual(
    mapPartyIdentityToXml({ kind: PartyIdentifierKind.NIP }, "BuyerNoVal", "buyer"),
    { NIP: "", Nazwa: "BuyerNoVal" },
  );
  assert.deepEqual(
    mapPartyIdentityToXml({ kind: PartyIdentifierKind.EU_VAT }, "EuNoVal", "buyer"),
    { KodUE: "", NrVatUE: "", Nazwa: "EuNoVal" },
  );
  assert.deepEqual(
    mapPartyIdentityToXml({ kind: PartyIdentifierKind.FOREIGN }, "ForNoVal", "buyer"),
    { NrID: "", Nazwa: "ForNoVal" },
  );
  assert.deepEqual(
    mapPartyIdentityToXml({ kind: PartyIdentifierKind.INTERNAL }, "IntNoVal", "buyer"),
    { IDWew: "", Nazwa: "IntNoVal" },
  );
  assert.deepEqual(
    mapPartyIdentityToXml({ kind: "unknown_kind" }, "DefNoVal", "buyer"),
    { NIP: "", Nazwa: "DefNoVal" },
  );
});

// ---------------------------------------------------------------------------
// builder.ts remaining branch matrix
// ---------------------------------------------------------------------------
test("builder.ts: branch matrix for optional mappings and validation paths", async () => {
  const emailOnly = await FA3Invoice.basic("FV/EMAIL/1")
    .issueDate("2026-01-15")
    .seller({ ...SELLER, email: "a@b.pl" })
    .buyer(BUYER)
    .addLine(LINE)
    .toXml();
  assert.match(emailOnly, /<Email>a@b.pl<\/Email>/);
  assert.doesNotMatch(emailOnly, /<Telefon>/);

  const phoneOnly = await FA3Invoice.basic("FV/PHONE/1")
    .issueDate("2026-01-15")
    .seller({ ...SELLER, phone: "123" })
    .buyer(BUYER)
    .addLine(LINE)
    .toXml();
  assert.match(phoneOnly, /<Telefon>123<\/Telefon>/);

  const customRole = await FA3Invoice.basic("FV/ROLE/1")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine(LINE)
    .addParty({ name: "Custom", taxId: "7777777777", role: "99" })
    .toXml();
  assert.match(customRole, /<Rola>99<\/Rola>/);

  const unknownPayment = await basicWithPaymentMethod("custom-code");
  assert.match(unknownPayment, /<FormaPlatnosci>custom-code<\/FormaPlatnosci>/);

  const correctionOnlyKsef = await FA3Invoice.correction("KOR/KSEF/1")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine({ ...LINE, beforeCorrection: true })
    .correction({
      reason: "r",
      correctedInvoiceNumber: "FV/1",
      correctedInvoiceDate: "2025-12-01",
      correctedKsefNumber: "KSEF-1",
    })
    .toXml();
  assert.match(correctionOnlyKsef, /<NumerKSeF>KSEF-1<\/NumerKSeF>/);

  const correctionUnknownType = await FA3Invoice.correction("KOR/T/1")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine(LINE)
    .correction({
      reason: "r",
      correctedInvoiceNumber: "FV/1",
      correctedInvoiceDate: "2025-12-01",
      correctionType: "custom",
    })
    .toXml();
  assert.match(correctionUnknownType, /<TypKorekty>custom<\/TypKorekty>/);

  const advanceNoPayments = await FA3Invoice.advance("ZAL/0")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .toXml();
  assert.doesNotMatch(advanceNoPayments, /<ZaliczkaCzesciowa>/);

  const basicTotalsWithAdvance = await FA3Invoice.basic("FV/ADV/1")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine(LINE)
    .advancePayment({ amount: 50, vatRate: 23 })
    .toXml();
  assert.match(basicTotalsWithAdvance, /<P_15>/);

  const rawExt = FA3Invoice.basic("FV/RAW/1")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine(LINE)
    .rawExtension("/x", "<x/>");
  assert.ok(rawExt.validate().some((issue) => issue.code === "raw_extension_unsupported"));

  const contractNoDate = await FA3Invoice.basic("FV/C/1")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine(LINE)
    .contract("UM/1")
    .toXml();
  assert.match(contractNoDate, /<NrUmowy>UM\/1<\/NrUmowy>/);
  assert.doesNotMatch(contractNoDate, /<DataUmowy>/);

  const orderRefNoDate = await FA3Invoice.basic("FV/O/1")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine(LINE)
    .orderReference("ZAM/9")
    .toXml();
  assert.match(orderRefNoDate, /<NrZamowienia>ZAM\/9<\/NrZamowienia>/);

  const orderNoVat = await FA3Invoice.basic("FV/OL/1")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine(LINE)
    .order(100)
    .orderLine({ description: "OL", quantity: 1, unitNetPrice: 100 })
    .toXml();
  assert.match(orderNoVat, /<Zamowienie>/);
  assert.doesNotMatch(orderNoVat, /<P_12Z>/);

  const transportMinimal = await FA3Invoice.basic("FV/TR/1")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine(LINE)
    .transport("road")
    .toXml();
  assert.match(transportMinimal, /<RodzajTransportu>3<\/RodzajTransportu>/);

  const intermediaryFalse = await FA3Invoice.basic("FV/INTM/1")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine(LINE)
    .transactionTerms({ intermediary: false })
    .toXml();
  assert.match(intermediaryFalse, /<Posrednik>0<\/Posrednik>/);

  const attachmentHeaderOnly = await FA3Invoice.basic("FV/ATT/2")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine(LINE)
    .attachment({ blocks: [{ header: "H", tables: [{ headers: ["a"], rows: [["b"]] }] }] })
    .toXml();
  assert.match(attachmentHeaderOnly, /<Naglowek>H<\/Naglowek>/);
  assert.doesNotMatch(attachmentHeaderOnly, /<Akapit>/);

  const paymentLinkOnly = await FA3Invoice.basic("FV/LINK/1")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine(LINE)
    .paymentLink("https://pay.example")
    .toXml();
  assert.match(paymentLinkOnly, /<LinkDoPlatnosci>https:\/\/pay.example<\/LinkDoPlatnosci>/);

  const dueDefaultMethod = await FA3Invoice.basic("FV/DUE/1")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine(LINE)
    .paymentDue("2026-02-01")
    .toXml();
  assert.match(dueDefaultMethod, /<FormaPlatnosci>6<\/FormaPlatnosci>/);

  const goodsMinimal = await FA3Invoice.basic("FV/G/1")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addGoodsLine("Towar", { quantity: 1, unitNetPrice: 10 })
    .toXml();
  assert.match(goodsMinimal, /<P_7>Towar<\/P_7>/);

  const fromDictSnake = FA3Draft.fromDict({
    invoice_number: "FV/SNAKE/1",
    issue_date: "2026-01-15",
    waluta: "usd",
    seller: SELLER,
    buyer: BUYER,
    lines: [LINE],
  });
  const snakeXml = await fromDictSnake.toXml();
  assert.match(snakeXml, /<KodWaluty>USD<\/KodWaluty>/);

  const draftClone = new FA3Draft({
    invoiceNumber: "FV/CLONE/1",
    issueDate: "2026-01-15",
    seller: SELLER,
    buyer: BUYER,
    lines: [LINE],
    order: { number: "Z1", totalGross: 100, lines: [{ description: "L", quantity: 1, unitNetPrice: 1 }] },
    attachment: { blocks: [{ header: "h" }] },
  });
  assert.equal(draftClone.toDict().order?.lines?.length, 1);

  const settlementDueCharges = await FA3Invoice.settlement("ROZ/CH/1")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine(LINE)
    .advanceReference({ invoiceNumber: "ZAL/1" })
    .settlementDetails({ amountDue: 124, charges: [{ amount: 1, reason: "c" }] })
    .toXml();
  assert.match(settlementDueCharges, /<SumaObciazen>/);

  const advanceCorrectionPayments = await FA3Invoice.advance_correction("KOR/Z/1")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .advancePayment({ amount: 10, currencyRate: 4.2 })
    .correction({ reason: "r", correctedInvoiceNumber: "ZAL/OLD", correctedInvoiceDate: "2025-12-01" })
    .toXml();
  assert.match(advanceCorrectionPayments, /<KursWalutyZW>4.2<\/KursWalutyZW>/);

  const prettyOff = await FA3Invoice.basic("FV/PRETTY/1")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine(LINE)
    .toXml({ pretty: false });
  assert.match(prettyOff, /<Faktura/);

  const attachmentNoTables = await FA3Invoice.basic("FV/ATT/3")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine(LINE)
    .attachment({ blocks: [{ header: "OnlyHeader", paragraphs: ["p1"] }] })
    .toXml();
  assert.match(attachmentNoTables, /<Akapit>p1<\/Akapit>/);
  assert.doesNotMatch(attachmentNoTables, /<Tabela>/);

  const attachmentEmptyTables = await FA3Invoice.basic("FV/ATT/4")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine(LINE)
    .attachment({ blocks: [{ header: "H", tables: [] }] })
    .toXml();
  assert.doesNotMatch(attachmentEmptyTables, /<Tabela>/);

  let hasLibxml = false;
  try {
    await import("libxmljs2");
    hasLibxml = true;
  } catch {
    hasLibxml = false;
  }
  if (hasLibxml) {
    const xsdValidated = await FA3Invoice.basic("FV/XSD/2")
      .issueDate("2026-01-15")
      .seller(SELLER)
      .buyer(BUYER)
      .addLine(LINE)
      .toXml({ xsdValidate: true });
    assert.match(xsdValidated, /<Faktura/);
  } else {
    const { validateFa3XmlWithValidator, FA3XmlValidationError } = await import("../../dist/documents/fa3.js");
    await assert.rejects(
      () =>
        validateFa3XmlWithValidator("<Faktura/>", async () => {
          throw new Error("xsd failed");
        }),
      FA3XmlValidationError,
    );
    await basicBuilder("FV/XSD/3")
      .toXml({ xsdValidate: true })
      .then(
        () => assert.fail("expected xsdValidate to fail without libxmljs2"),
        (error) => assert.ok(error instanceof FA3XmlValidationError),
      );
  }
});

function basicWithPaymentMethod(method) {
  return FA3Invoice.basic("FV/PAY/1")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine(LINE)
    .payment({ method })
    .toXml();
}

test("builder.ts: FA3BatchDraft skips sparse entries in exporters", async () => {
  const good = FA3Invoice.basic("FV/SPARSE/1")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine(LINE)
    .build();
  const sparse = new FA3BatchDraft([good, undefined]);
  const dir = await mkdtemp(path.join(os.tmpdir(), "fa3-sparse-"));
  try {
    const files = await sparse.toXmlFiles(path.join(dir, "out"));
    assert.equal(files.length, 1);
    const zip = await sparse.toXmlZip(path.join(dir, "batch.zip"));
    assert.ok(zip.endsWith("batch.zip"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("builder.ts: mapOrder returns undefined without lines or total", () => {
  const noOrder = new FA3Draft({
    invoiceNumber: "FV/NOORDER/1",
    issueDate: "2026-01-15",
    seller: SELLER,
    buyer: BUYER,
    lines: [LINE],
    order: { number: "Z", lines: [] },
  });
  const payload = noOrder.toFakturaInput();
  assert.equal(payload.Fa.Zamowienie, undefined);
});
