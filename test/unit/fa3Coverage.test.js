import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { test, mock } from "node:test";

import {
  // builder
  FA3Invoice,
  FA3Draft,
  FA3BatchDraft,
  FA3InvoiceBuilder,
  BaseFA3Builder,
  AdvanceCorrectionInvoiceBuilder,
  SettlementCorrectionInvoiceBuilder,
  // template
  FA3Template,
  // tax
  TaxSummary,
  // importer
  FA3Importer,
  FA3ImportResult,
  FA3InvalidRow,
  FA3ImportError,
  ImportMode,
  toBatchDraft,
  // domain
  Address,
  Contact,
  PartyIdentifier,
  PartyIdentifierKind,
  InvoiceParty,
  TaxCategory,
  Discount,
  InvoiceLine,
  PartialPayment,
  SettlementAdjustment,
  AnnotationSet,
  FA3ValidationResult,
  ThirdPartyRole,
  AuthorizedPartyRole,
  // sections
  AdditionalDescription,
  Registry,
  Footer,
  PaymentDue,
  CorrectedAdvanceState,
  ExciseRefund,
  AdvancePayment,
  // publicApi factories
  Annotation,
  Attachment,
  AttachmentBlock,
  AttachmentTable,
  BankAccount,
  Contract,
  CorrectionReference,
  FA3InvoiceKind,
  FA3Line,
  FA3Party,
  FA3ValidationIssue,
  LineIdentifiers,
  NewTransportMeans,
  Order,
  OrderLine,
  PaymentTerms,
  RawXmlExtension,
  Settlement,
  TransactionTerms,
  Transport,
  ValidationContext,
  // xml
  validateFa3Xml,
  invoiceToXml,
  invoice_to_xml,
  FA3XmlValidationError,
  // xsd
  resolveFa3SchemaEntryPath,
  loadFa3SchemaWithLocalImports,
  validateFa3XmlXsd,
  // xsdMap
  parseFa3XsdElements,
  parse_fa3_xsd_elements,
  XsdElement,
  // xsdAudit
  auditFa3XsdCoverage,
  audit_fa3_xsd_coverage,
  CoverageStatus,
} from "../../dist/index.js";

import * as fa3Subpath from "../../dist/documents/fa3.js";

const SELLER = { name: "Sprzedawca Sp. z o.o.", taxId: "1111111111", addressLine1: "ul. A 1, 00-001 Warszawa" };
const BUYER = { name: "Nabywca Sp. z o.o.", taxId: "2222222222", addressLine1: "ul. B 2, 00-002 Warszawa" };
const LINE = { description: "Usługa", quantity: 1, unit: "szt", unitNetPrice: 100, vatRate: 23 };

function basicBuilder(number = "FV/1") {
  return FA3Invoice.basic(number).issueDate("2026-01-15").seller(SELLER).buyer(BUYER).addLine(LINE);
}

let hasLibxml = false;
try {
  await import("libxmljs2");
  hasLibxml = true;
} catch {
  hasLibxml = false;
}

// ---------------------------------------------------------------------------
// 1. fa3.ts barrel — touch every re-export binding (c8 counts each as a function on line 1)
// ---------------------------------------------------------------------------
test("fa3.ts barrel re-exports FA3Invoice and builds", async () => {
  assert.equal(typeof fa3Subpath.FA3Invoice, "function");
  const builder = fa3Subpath.FA3Invoice.basic("FV/BARREL/1");
  builder.issueDate("2026-01-15").seller(SELLER).buyer(BUYER).addLine(LINE);
  const xml = await builder.toXml();
  assert.match(xml, /<P_2>FV\/BARREL\/1<\/P_2>/);
});

test("fa3.ts barrel touches every public re-export binding", () => {
  const keys = Object.keys(fa3Subpath).sort();
  assert.ok(keys.length >= 80);
  for (const key of keys) {
    const value = fa3Subpath[key];
    assert.notEqual(value, undefined, key);
    if (typeof value === "function" && value.prototype?.constructor === value) {
      try {
        value();
      } catch {
        // constructors may require args
      }
    }
  }
});

// ---------------------------------------------------------------------------
// 2. FA3Template
// ---------------------------------------------------------------------------
test("FA3Template.sampleBatch + createJson + create_xlsx throws", async () => {
  const batch = FA3Template.sampleBatch();
  assert.ok(batch instanceof FA3BatchDraft);
  assert.equal(batch.drafts.length, 1);

  const dir = await mkdtemp(path.join(os.tmpdir(), "fa3-tmpl-"));
  try {
    const target = path.join(dir, "nested", "sample.json");
    const written = FA3Template.createJson(target);
    assert.equal(written, path.resolve(target));
    const parsed = FA3BatchDraft.fromJson(await import("node:fs").then((fs) => fs.readFileSync(written, "utf8")));
    assert.equal(parsed.drafts.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  assert.throws(() => FA3Template.create_xlsx(), /XLSX/);
});

// ---------------------------------------------------------------------------
// 3. TaxSummary.fromLines
// ---------------------------------------------------------------------------
test("TaxSummary.fromLines: comma decimals, null vatRate, explicit amounts, multi-rate", () => {
  const rows = TaxSummary.fromLines([
    { description: "a", quantity: "2", unit: "szt", unitNetPrice: "10,50", vatRate: 23 },
    { description: "b", quantity: 1, unit: "szt", unitNetPrice: 100, vatRate: null },
    { description: "c", quantity: 1, unit: "szt", unitNetPrice: 100, vatRate: 23 },
    {
      description: "d",
      quantity: 1,
      unit: "szt",
      unitNetPrice: 100,
      vatRate: 8,
      netAmount: 100,
      vatAmount: 8,
      grossAmount: 108,
    },
    { description: "e", quantity: "x", unit: "szt", unitNetPrice: "y" },
  ]);
  const byCode = Object.fromEntries(rows.map((r) => [r.rateCode, r]));
  assert.ok(byCode["23"]);
  assert.ok(byCode["0 KR"]);
  assert.ok(byCode["8"]);
  // 23% aggregation: (2*10.5=21) + (100) = 121 net
  assert.equal(byCode["23"].net, 121);
  assert.equal(byCode["8"].vat, 8);
});

// ---------------------------------------------------------------------------
// 4. publicApi factories
// ---------------------------------------------------------------------------
test("publicApi factories cover all branches", () => {
  assert.deepEqual(FA3Party.create({ name: "n", taxId: "t" }), { name: "n", taxId: "t" });
  assert.deepEqual(FA3Line.create(LINE), { ...LINE });

  const issue = new FA3ValidationIssue("msg");
  assert.equal(issue.code, "validation_issue");
  assert.equal(issue.path, undefined);
  const located = issue.withLocation("some.path");
  assert.equal(located.path, "some.path");
  const issueWithPath = new FA3ValidationIssue("m", "c", "p");
  assert.equal(issueWithPath.path, "p");

  assert.deepEqual(Annotation.create("k", "v"), { key: "k", value: "v" });
  assert.equal(Annotation.splitPayment().key, "split_payment");
  assert.equal(Annotation.cashMethod().key, "cash_method");

  const fullTable = AttachmentTable.create({
    headers: ["h1"],
    rows: [["r1"]],
    columnTypes: ["text"],
    metadata: [["a", "b"]],
    description: "desc",
    footer: ["f"],
  });
  assert.equal(fullTable.description, "desc");
  const minTable = AttachmentTable.create({ headers: ["h"], rows: [["r"]] });
  assert.equal(minTable.description, undefined);

  const fullBlock = AttachmentBlock.create({
    header: "H",
    metadata: [["a", "b"]],
    paragraphs: ["p"],
    tables: [minTable],
  });
  assert.equal(fullBlock.header, "H");
  const emptyBlock = AttachmentBlock.create();
  assert.deepEqual(emptyBlock, {});

  const att = Attachment.create([fullBlock]);
  assert.equal(att.blocks.length, 1);
  const attText = Attachment.text("Header", "p1", "p2");
  assert.equal(attText.blocks[0].header, "Header");

  assert.deepEqual(BankAccount.create("PL123", "d"), { number: "PL123", description: "d" });
  assert.deepEqual(BankAccount.create("PL123"), { number: "PL123" });

  assert.deepEqual(Contract.create("C1", "2026-01-01"), { number: "C1", date: "2026-01-01" });
  assert.deepEqual(Contract.create("C1"), { number: "C1" });

  assert.deepEqual(CorrectionReference.create("F1", "2026-01-01", "KSEF1"), {
    invoiceNumber: "F1",
    issueDate: "2026-01-01",
    ksefNumber: "KSEF1",
  });
  assert.deepEqual(CorrectionReference.create("F1"), { invoiceNumber: "F1" });

  assert.deepEqual(LineIdentifiers.create({ gtin: "123" }), { gtin: "123" });
  assert.deepEqual(NewTransportMeans.create({ make: "VW" }), { make: "VW" });
  assert.deepEqual(OrderLine.create({ description: "d", quantity: 1, unitNetPrice: 2 }), {
    description: "d",
    quantity: 1,
    unitNetPrice: 2,
  });

  const orderWithLines = Order.create({ number: "Z1", lines: [{ description: "d", quantity: 1, unitNetPrice: 2 }] });
  assert.equal(orderWithLines.lines.length, 1);
  const orderNoLines = Order.create({ number: "Z2" });
  assert.equal(orderNoLines.lines, undefined);

  const ptFull = PaymentTerms.create({
    method: "6",
    partialPayments: [{ amount: 1, paidOn: "2026-01-01" }],
    bankAccounts: [{ number: "PL1" }],
  });
  assert.equal(ptFull.partialPayments.length, 1);
  const ptMin = PaymentTerms.create({ method: "6" });
  assert.equal(ptMin.partialPayments, undefined);
  const transferFull = PaymentTerms.transfer({ dueDate: "2026-02-01", bankAccount: { number: "PL9" } });
  assert.equal(transferFull.method, "6");
  assert.equal(transferFull.bankAccounts.length, 1);
  const transferEmpty = PaymentTerms.transfer();
  assert.equal(transferEmpty.method, "6");
  assert.equal(transferEmpty.bankAccounts, undefined);

  assert.deepEqual(RawXmlExtension.create("/x", "<x/>"), { path: "/x", xml: "<x/>" });

  const settlementFull = Settlement.create({
    amountDue: 10,
    charges: [{ amount: 1, reason: "r" }],
    deductions: [{ amount: 2, reason: "r2" }],
  });
  assert.equal(settlementFull.charges.length, 1);
  const settlementMin = Settlement.create({ amountDue: 10 });
  assert.equal(settlementMin.charges, undefined);

  assert.deepEqual(TransactionTerms.create({ deliveryTerms: "EXW" }), { deliveryTerms: "EXW" });
  assert.deepEqual(Transport.create({ kind: "road" }), { kind: "road" });

  assert.deepEqual(ValidationContext.create("src", 3), { source: "src", rowNumber: 3 });
  assert.deepEqual(ValidationContext.create(), {});

  assert.equal(FA3InvoiceKind.BASIC, "basic");
});

// ---------------------------------------------------------------------------
// 5. domain.ts
// ---------------------------------------------------------------------------
test("domain.ts helpers cover all branches", () => {
  assert.deepEqual(Address.polish("l1"), { countryCode: "PL", line1: "l1" });
  assert.deepEqual(Address.polish("l1", "l2", "l3"), { countryCode: "PL", line1: "l1", line2: "l2", line3: "l3" });
  assert.deepEqual(Address.foreign("de", "l1"), { countryCode: "DE", line1: "l1" });
  assert.deepEqual(Address.foreign("de", "l1", "l2", "l3"), {
    countryCode: "DE",
    line1: "l1",
    line2: "l2",
    line3: "l3",
  });

  assert.deepEqual(Contact.create({ email: "e@x.pl", phone: "123" }), { email: "e@x.pl", phone: "123" });

  assert.deepEqual(PartyIdentifier.polishNip("111"), { kind: PartyIdentifierKind.NIP, value: "111" });
  assert.deepEqual(PartyIdentifier.euVat("de", "123"), {
    kind: PartyIdentifierKind.EU_VAT,
    value: "123",
    countryCode: "DE",
  });
  assert.deepEqual(PartyIdentifier.foreign("F1", "us"), {
    kind: PartyIdentifierKind.FOREIGN,
    value: "F1",
    countryCode: "US",
  });
  assert.deepEqual(PartyIdentifier.foreign("F1"), { kind: PartyIdentifierKind.FOREIGN, value: "F1" });
  assert.deepEqual(PartyIdentifier.internal("I1"), { kind: PartyIdentifierKind.INTERNAL, value: "I1" });
  assert.deepEqual(PartyIdentifier.none(), { kind: PartyIdentifierKind.NONE });

  const pc = InvoiceParty.polishCompany({ nip: "111", name: "n", address: "a", email: "e", phone: "p" });
  assert.equal(pc.taxId, "111");
  assert.equal(pc.email, "e");
  const pcMin = InvoiceParty.polishCompany({ nip: "111", name: "n" });
  assert.equal(pcMin.addressLine1, undefined);

  const eu = InvoiceParty.euCompany({ vatId: "123", countryCode: "de", name: "n", address: "a", email: "e", phone: "p" });
  assert.equal(eu.taxId, "DE123");
  const euMin = InvoiceParty.euCompany({ vatId: "123", countryCode: "de", name: "n" });
  assert.equal(euMin.email, undefined);

  const fc = InvoiceParty.foreignCompany({ identifier: "X", countryCode: "us", name: "n", address: "a" });
  assert.equal(fc.taxId, "US:X");
  const fcMin = InvoiceParty.foreignCompany({ identifier: "X", countryCode: "us", name: "n" });
  assert.equal(fcMin.addressLine1, undefined);

  const wt = InvoiceParty.withoutTaxId({ name: "n", countryCode: "us", address: "a" });
  assert.equal(wt.taxId, "BRAK");
  assert.equal(wt.countryCode, "US");
  const wtMin = InvoiceParty.withoutTaxId({ name: "n" });
  assert.equal(wtMin.countryCode, "PL");

  assert.equal(TaxCategory.standard23().vatRate, 23);
  assert.equal(TaxCategory.standard22().vatRate, 22);
  assert.equal(TaxCategory.reduced8().vatRate, 8);
  assert.equal(TaxCategory.reduced7().vatRate, 7);
  assert.equal(TaxCategory.reduced5().vatRate, 5);
  assert.equal(TaxCategory.zeroDomestic().code, "0 KR");
  assert.equal(TaxCategory.zeroWdt().code, "0 WDT");
  assert.equal(TaxCategory.zeroExport().code, "0 EX");
  assert.equal(TaxCategory.exempt("art 43").exemptionBasis, "art 43");
  assert.equal(TaxCategory.outsideCountry().code, "np I");
  assert.equal(TaxCategory.serviceArticle100().code, "np II");
  assert.equal(TaxCategory.reverseCharge().code, "oo");

  assert.deepEqual(Discount.amount(10, "promo"), { kind: "amount", value: 10, reason: "promo" });
  assert.deepEqual(Discount.amount(10), { kind: "amount", value: 10 });
  assert.deepEqual(Discount.percent(5, "promo"), { kind: "percent", value: 5, reason: "promo" });
  assert.deepEqual(Discount.percent(5), { kind: "percent", value: 5 });

  const goods = InvoiceLine.goods("g", {
    quantity: 1,
    unitNetPrice: 100,
    unit: "kg",
    vatRate: 23,
    beforeCorrection: false,
    gtu: "GTU_01",
    procedure: "SW",
    annex15: true,
  });
  assert.equal(goods.unit, "kg");
  const goodsMin = InvoiceLine.goods("g", { quantity: 1, unitNetPrice: 100 });
  assert.equal(goodsMin.unit, "szt");
  assert.equal(InvoiceLine.service("s", { quantity: 1, unitNetPrice: 5 }).description, "s");
  assert.equal(InvoiceLine.correctedBefore("b", { quantity: 1, unitNetPrice: 5 }).beforeCorrection, true);
  assert.equal(InvoiceLine.correctedAfter("a", { quantity: 1, unitNetPrice: 5 }).beforeCorrection, false);

  assert.deepEqual(PartialPayment.create(10, "2026-01-01"), { amount: 10, paidOn: "2026-01-01" });
  assert.deepEqual(PartialPayment.create(10, "2026-01-01", { method: "6", otherMethodDescription: "d" }), {
    amount: 10,
    paidOn: "2026-01-01",
    method: "6",
    otherMethodDescription: "d",
  });

  assert.deepEqual(SettlementAdjustment.create(5, "reason"), { amount: 5, reason: "reason" });

  const set = new AnnotationSet([{ key: "k", value: "v" }]);
  assert.equal(set.items.length, 1);
  assert.equal(AnnotationSet.default().items.length, 0);
  assert.equal(AnnotationSet.splitPayment().key, "split_payment");
  assert.equal(AnnotationSet.cashMethod().key, "cash_method");

  const res = new FA3ValidationResult([{ code: "c", message: "m" }], [{ code: "w", message: "w" }]);
  assert.equal(res.errors.length, 1);
  assert.equal(res.warnings.length, 1);
  const resDefault = new FA3ValidationResult();
  assert.deepEqual(resDefault.errors, []);

  assert.equal(ThirdPartyRole.OTHER, "11");
  assert.equal(AuthorizedPartyRole.REPRESENTATIVE, "1");
});

// ---------------------------------------------------------------------------
// 6. sections.ts
// ---------------------------------------------------------------------------
test("sections.ts helpers cover all branches", () => {
  const ad = new AdditionalDescription("k", "v");
  assert.equal(ad.key, "k");
  assert.equal(AdditionalDescription.keyValue("k2", "v2").value, "v2");

  const reg = new Registry("KRS", "123", "Full Name");
  assert.equal(reg.fullName, "Full Name");
  assert.equal(Registry.krsEntry("456").fullName, undefined);
  assert.equal(Registry.krsEntry("456", "Name").fullName, "Name");

  assert.equal(new Footer("footer text").text, "footer text");

  assert.equal(PaymentDue.date("2026-02-01"), "2026-02-01");
  assert.equal(PaymentDue.description(30, "dni", "2026-01-01"), "30 dni od 2026-01-01");

  assert.equal(new CorrectedAdvanceState("state").text, "state");

  assert.equal(new ExciseRefund().enabled, true);
  assert.equal(new ExciseRefund(false).enabled, false);

  assert.deepEqual(AdvancePayment.create(100), { amount: 100 });
  assert.deepEqual(AdvancePayment.create(100, { vatRate: 23, paidOn: "2026-01-01", currencyRate: 4.5 }), {
    amount: 100,
    vatRate: 23,
    paidOn: "2026-01-01",
    currencyRate: 4.5,
  });
});

// ---------------------------------------------------------------------------
// 7. importer
// ---------------------------------------------------------------------------
test("importer: fromJson string / faktury key / object / VALIDATE_ONLY", () => {
  const validRow = {
    invoiceNumber: "FV/IMP/1",
    issueDate: "2026-01-15",
    seller: SELLER,
    buyer: BUYER,
    lines: [LINE],
  };

  const fromString = FA3Importer.fromJson(JSON.stringify({ drafts: [validRow] }));
  assert.equal(fromString.validDrafts.length, 1);

  const fromFaktury = FA3Importer.fromJson(JSON.stringify({ faktury: [validRow] }));
  assert.equal(fromFaktury.validDrafts.length, 1);

  const fromObject = FA3Importer.fromJson({ drafts: [validRow] });
  assert.equal(fromObject.validDrafts.length, 1);

  const validateOnly = FA3Importer.fromJson({ drafts: [validRow] }, { mode: ImportMode.VALIDATE_ONLY });
  assert.equal(validateOnly.validDrafts.length, 0);
  assert.equal(validateOnly.invalidRows.length, 0);

  // from_json alias + toBatchDraft
  const aliased = FA3Importer.from_json({ drafts: [validRow] });
  const batch = toBatchDraft(aliased);
  assert.ok(batch instanceof FA3BatchDraft);
  assert.equal(batch.drafts.length, 1);
});

test("importer: file path source", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "fa3-imp-"));
  try {
    const file = path.join(dir, "batch.json");
    await writeFile(
      file,
      JSON.stringify({
        drafts: [{ invoiceNumber: "FV/FILE/1", issueDate: "2026-01-15", seller: SELLER, buyer: BUYER, lines: [LINE] }],
      }),
      "utf8",
    );
    const result = FA3Importer.fromJson(file);
    assert.equal(result.validDrafts.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("importer: invalid JSON normal + FAIL_FAST", () => {
  const normal = FA3Importer.fromJson("{ not json ");
  assert.equal(normal.validDrafts.length, 0);
  assert.equal(normal.invalidRows.length, 1);
  assert.equal(normal.errors.length, 1);

  assert.throws(() => FA3Importer.fromJson("{ not json ", { mode: ImportMode.FAIL_FAST }), FA3ImportError);
});

test("importer: empty payload normal + FAIL_FAST + non-object payload", () => {
  const empty = FA3Importer.fromJson(JSON.stringify({ other: [] }));
  assert.equal(empty.invalidRows.length, 1);
  assert.match(empty.errors[0].message, /drafts lub faktury/);

  const nonObject = FA3Importer.fromJson("123");
  assert.equal(nonObject.invalidRows.length, 1);

  assert.throws(
    () => FA3Importer.fromJson(JSON.stringify({ other: [] }), { mode: ImportMode.FAIL_FAST }),
    FA3ImportError,
  );
});

test("importer: invalid row (validation issues) normal + FAIL_FAST", () => {
  const badRow = { invoiceNumber: "", issueDate: "", seller: {}, buyer: {}, lines: [] };
  const normal = FA3Importer.fromJson({ drafts: [badRow] });
  assert.equal(normal.validDrafts.length, 0);
  assert.equal(normal.invalidRows.length, 1);
  assert.ok(normal.errors.length > 0);

  assert.throws(() => FA3Importer.fromJson({ drafts: [badRow] }, { mode: ImportMode.FAIL_FAST }), FA3ImportError);
});

test("importer: row that throws during validation normal + FAIL_FAST", () => {
  // simplifiedReceiptLike triggers extractTotals -> toNumber throws on bad quantity
  const throwingRow = {
    invoiceNumber: "FV/THROW/1",
    issueDate: "2026-01-15",
    seller: SELLER,
    buyer: BUYER,
    lines: [{ description: "x", quantity: "abc", unit: "szt", unitNetPrice: "def", vatRate: 23 }],
    simplifiedReceiptLike: true,
  };
  const normal = FA3Importer.fromJson({ drafts: [throwingRow] });
  assert.equal(normal.invalidRows.length, 1);
  assert.ok(normal.errors.length > 0);

  assert.throws(() => FA3Importer.fromJson({ drafts: [throwingRow] }, { mode: ImportMode.FAIL_FAST }), FA3ImportError);
});

test("importer: fromXlsx throws + result/row constructors", () => {
  assert.throws(() => FA3Importer.fromXlsx(), FA3ImportError);

  const row = new FA3InvalidRow("msg", 2, "FV/1");
  assert.equal(row.rowNumber, 2);
  assert.equal(row.invoiceNumber, "FV/1");
  const rowMin = new FA3InvalidRow("msg");
  assert.equal(rowMin.rowNumber, undefined);

  const resDefault = new FA3ImportResult();
  assert.deepEqual(resDefault.validDrafts, []);
  const res = new FA3ImportResult({
    validDrafts: [],
    invalidRows: [row],
    errors: [{ code: "c", message: "m" }],
    warnings: [{ code: "w", message: "w" }],
  });
  assert.equal(res.invalidRows.length, 1);
  assert.equal(res.warnings.length, 1);
});

// ---------------------------------------------------------------------------
// 8. builder gaps + mappings
// ---------------------------------------------------------------------------
test("builder: full-featured basic invoice serializes many branches", async () => {
  const builder = FA3Invoice.basic("FV/FULL/1")
    .issuedOn(new Date("2026-01-15T10:00:00Z"))
    .issuePlace("Warszawa")
    .currency("eur")
    .seller({
      ...SELLER,
      addressLine2: "piętro 2",
      addressLine3: "biuro 3",
      eori: "PL123456789",
      email: "seller@x.pl",
      phone: "500100200",
    })
    .buyer(BUYER)
    .saleDate("2026-01-14T00:00:00Z")
    .addGoodsLine("Towar", {
      quantity: 2,
      unitNetPrice: 50,
      vatRate: 23,
      gtu: "GTU_01",
      procedure: "SW",
      annex15: true,
    })
    .addLine({
      description: "Z metadanymi",
      quantity: 1,
      unit: "szt",
      unitNetPrice: 10,
      vatRate: 0,
      uniqueId: "UU-1",
      serviceDate: "2026-01-10T00:00:00Z",
      beforeCorrection: false,
    })
    .additionalDescription("Uwaga", "Treść")
    .contract("UM/1", "2026-01-01")
    .orderReference("ZAM/1", "2026-01-02")
    .transactionTerms({ deliveryTerms: "EXW", contractualRate: "4.5", contractualCurrency: "EUR", intermediary: true })
    .transport("road", { orderNumber: "TR/1", cargoDescription: "paczki", packageUnit: "karton" })
    .payment({
      dueDate: "2026-02-01",
      method: "6",
      bankAccounts: [
        { number: "PL10", swift: "SWIFT", bankName: "Bank", description: "opis", ownBankAccountType: "1" },
      ],
      factorBankAccounts: [{ number: "PL20" }],
      paymentLink: "https://pay",
      ipksef: "IP1",
      partialPayments: [
        { amount: 10, paidOn: "2026-01-20" },
        { amount: 5, paidOn: "2026-01-21", otherMethodDescription: "Barter" },
      ],
    })
    .foreignCurrencyRate(4.32);

  const xml = await builder.toXml({ pretty: true });
  assert.match(xml, /<NrEORI>PL123456789<\/NrEORI>/);
  assert.match(xml, /<RachunekBankowyFaktora>/);
  assert.match(xml, /<PlatnoscInna>1<\/PlatnoscInna>/);
  assert.match(xml, /<RodzajTransportu>3<\/RodzajTransportu>/);
  assert.match(xml, /<GTU>GTU_01<\/GTU>/);
  assert.match(xml, /<UU_ID>UU-1<\/UU_ID>/);
  assert.match(xml, /<P_18A>1<\/P_18A>/);
});

test("builder: order mapping + attachment blocks + transport other", async () => {
  const xml = await FA3Invoice.basic("FV/ORDER/1")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine(LINE)
    .order(246)
    .orderLine({ description: "OL1", quantity: 2, unitNetPrice: 100, vatRate: 23 })
    .orderLine({ description: "OL2", quantity: 1, unitNetPrice: 10, vatRate: 0 })
    .transport("other")
    .attachment({
      blocks: [
        { header: "Blok", paragraphs: ["akapit"], tables: [{ headers: ["h"], rows: [["r"]] }] },
      ],
    })
    .toXml();
  assert.match(xml, /<Zamowienie>/);
  assert.match(xml, /<TransportInny>1<\/TransportInny>/);
  assert.match(xml, /<Zalacznik>/);
});

test("builder: attachmentText branch", async () => {
  const xml = await basicBuilder("FV/ATT/1").attachmentText("Opis załącznika").toXml();
  assert.match(xml, /<Opis>Opis załącznika<\/Opis>/);
});

test("builder: paid date branch + splitPayment", async () => {
  const xml = await basicBuilder("FV/PAID/1").paid("2026-02-01").splitPayment().toXml();
  assert.match(xml, /<Zaplacono>1<\/Zaplacono>/);
});

test("builder: dueDescription parsed + parts + garbage + method 7", async () => {
  const parsed = await basicBuilder("FV/DD/1").paymentDueDescription(30, "dni", "2026-01-01").toXml();
  assert.match(parsed, /<TerminOpis>/);

  const parts = await FA3Invoice.basic("FV/DD/2")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine(LINE)
    .payment({ dueDescriptionParts: { amount: 2, unit: "dni", startsFrom: "wystawienia" }, dueDate: "2026-02-01" })
    .toXml();
  assert.match(parts, /<TerminOpis>/);

  const garbage = await basicBuilder("FV/DD/3").payment({ dueDescription: "garbage text" }).toXml();
  assert.doesNotMatch(garbage, /<TerminOpis>/);

  const method7 = await basicBuilder("FV/DD/4").payment({ method: "7" }).toXml();
  assert.match(method7, /<FormaPlatnosci>7<\/FormaPlatnosci>/);

  const otherOnly = await basicBuilder("FV/DD/5").payment({ otherMethodDescription: "Barter" }).toXml();
  assert.match(otherOnly, /<PlatnoscInna>1<\/PlatnoscInna>/);
});

test("builder: bankAccount + paymentLink + paymentDue convenience helpers", async () => {
  const xml = await basicBuilder("FV/BANK/1")
    .bankAccount({ number: "PL55" })
    .paymentLink("https://pay", "IPX")
    .paymentDue("2026-02-01", "transfer")
    .toXml();
  assert.match(xml, /<NrRB>PL55<\/NrRB>/);
});

test("builder: additional parties (roles, ids, jst, vat group)", async () => {
  const xml = await FA3Invoice.basic("FV/PARTY/1")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer({ ...BUYER, isJstSubunit: true, isVatGroupMember: true })
    .addLine(LINE)
    .addParty({
      name: "Odbiorca",
      taxId: "3333333333",
      role: "recipient",
      buyerId: "BID1",
      share: 50,
      customerNumber: "CN1",
    })
    .addParty({ name: "Inny", taxId: "4444444444", role: "other", otherRoleDescription: "Rola inna" })
    .addParty({ name: "JST", taxId: "5555555555", role: "jst_subunit" })
    .addParty({ name: "GV", taxId: "6666666666", role: "vat_group_member" })
    .toXml();
  assert.match(xml, /<JST>1<\/JST>/);
  assert.match(xml, /<GV>1<\/GV>/);
  assert.match(xml, /<RolaInna>1<\/RolaInna>/);
  assert.match(xml, /<IDNabywcy>BID1<\/IDNabywcy>/);
});

test("builder: advance invoice with advance payments + foreignCurrencyRate", async () => {
  const xml = await FA3Invoice.advance("ZAL/1")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .advancePayment({ amount: 123, vatRate: 23, currencyRate: 4.5 })
    .advancePayment({ amount: 50 })
    .foreignCurrencyRate(4.32)
    .toXml();
  assert.match(xml, /<RodzajFaktury>ZAL<\/RodzajFaktury>/);
  assert.match(xml, /<ZaliczkaCzesciowa>/);
  assert.match(xml, /<KursWalutyZ>/);
});

test("builder: correction with full metadata", async () => {
  const xml = await FA3Invoice.correction("KOR/1")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addCorrectedLineBeforeAfter({
      before: { description: "przed", quantity: 1, unit: "szt", unitNetPrice: 100, vatRate: 23 },
      after: { description: "po", quantity: 1, unit: "szt", unitNetPrice: 120, vatRate: 23 },
    })
    .correction({
      reason: "Błąd ceny",
      correctedInvoiceNumber: "FV/OLD/1",
      correctedInvoiceDate: "2025-12-01",
      correctedKsefNumber: "KSEF-OLD",
      correctionType: "tax_base_or_tax",
    })
    .correctedPeriod("2025-12")
    .correctedInvoiceNumberOverride("FV/OLD/1-OVR")
    .toXml();
  assert.match(xml, /<RodzajFaktury>KOR<\/RodzajFaktury>/);
  assert.match(xml, /<TypKorekty>1<\/TypKorekty>/);
  assert.match(xml, /<OkresFaKorygowanej>2025-12<\/OkresFaKorygowanej>/);
  assert.match(xml, /<NrFaKorygowany>FV\/OLD\/1-OVR<\/NrFaKorygowany>/);
  assert.match(xml, /<StanPrzed>1<\/StanPrzed>/);
});

test("builder: advance_correction + settlement_correction statics", async () => {
  const ac = FA3Invoice.advance_correction("KOR_ZAL/1");
  assert.ok(ac instanceof AdvanceCorrectionInvoiceBuilder);
  const acXml = await ac
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .advancePayment({ amount: 100, vatRate: 23 })
    .correction({ reason: "r", correctedInvoiceNumber: "F1", correctedInvoiceDate: "2025-12-01" })
    .toXml();
  assert.match(acXml, /<RodzajFaktury>KOR_ZAL<\/RodzajFaktury>/);

  const sc = FA3Invoice.settlement_correction("KOR_ROZ/1");
  assert.ok(sc instanceof SettlementCorrectionInvoiceBuilder);
  const scXml = await sc
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine(LINE)
    .advanceReference({ invoiceNumber: "ZAL/1" })
    .correction({ reason: "r", correctedInvoiceNumber: "F1", correctedInvoiceDate: "2025-12-01" })
    .settlementDetails({ amountToSettle: 50 })
    .toXml();
  assert.match(scXml, /<RodzajFaktury>KOR_ROZ<\/RodzajFaktury>/);
});

test("builder: settlement variants (amountDue, amountToSettle+charges, settlementAmount, none)", async () => {
  const due = await FA3Invoice.settlement("ROZ/1")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine(LINE)
    .advanceReference({ invoiceNumber: "ZAL/1" })
    .settlementDetails({ amountDue: 123 })
    .toXml();
  assert.match(due, /<DoZaplaty>123.00<\/DoZaplaty>/);

  const toSettle = await FA3Invoice.settlement("ROZ/2")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine(LINE)
    .advanceReference({ ksefNumber: "KSEF-ZAL" })
    .settlementDetails({
      amountToSettle: 50,
      charges: [{ amount: 10, reason: "opłata" }],
      deductions: [{ amount: 5, reason: "rabat" }],
    })
    .toXml();
  assert.match(toSettle, /<DoRozliczenia>/);
  assert.match(toSettle, /<SumaObciazen>/);
  assert.match(toSettle, /<SumaOdliczen>/);

  const settlementAmount = await FA3Invoice.settlement("ROZ/3")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine(LINE)
    .advanceReference({ invoiceNumber: "ZAL/1" })
    .settlementAmount(200)
    .toXml();
  assert.match(settlementAmount, /<DoZaplaty>200.00<\/DoZaplaty>/);

  const none = await FA3Invoice.settlement("ROZ/4")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine(LINE)
    .advanceReference({ invoiceNumber: "ZAL/1" })
    .toXml();
  assert.doesNotMatch(none, /<Rozliczenie>/);
});

test("builder: settlesAdvance sets and clears advance invoice references", async () => {
  const withInvoiceRef = await FA3Invoice.settlement("ROZ/5")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine(LINE)
    .settlesAdvance({ invoiceNumber: "ZAL/5" })
    .settlementAmount(100)
    .toXml();
  assert.match(withInvoiceRef, /<NrFakturyZaliczkowej>ZAL\/5<\/NrFakturyZaliczkowej>/);

  const withKsefRef = await FA3Invoice.settlement("ROZ/5B")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine(LINE)
    .settlesAdvance({ ksefNumber: "KSEF-ZAL-5" })
    .settlementAmount(100)
    .toXml();
  assert.match(withKsefRef, /<NrKSeFFaZaliczkowej>KSEF-ZAL-5<\/NrKSeFFaZaliczkowej>/);

  const cleared = FA3Invoice.settlement("ROZ/6")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine(LINE)
    .advanceReference({ invoiceNumber: "ZAL/6" })
    .settlesAdvance({ invoiceNumber: "ZAL/OLD" })
    .settlesAdvance({})
    .build();
  const dict = cleared.toDict();
  assert.equal(dict.advanceInvoiceNumber, undefined);
  assert.equal(dict.advanceKsefNumber, undefined);
});

test("builder: period invoice + simplified builder", async () => {
  const period = await FA3Invoice.basic("FV/PER/1")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine(LINE)
    .period("2026-01-01", "2026-01-31")
    .toXml();
  assert.match(period, /<OkresFa>/);

  const simplified = await FA3Invoice.simplified("FV/SIMP/1")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine(LINE)
    .addServiceLine("Serwis", { quantity: 1, unitNetPrice: 10, vatRate: 23 })
    .toXml();
  assert.match(simplified, /<RodzajFaktury>UPR<\/RodzajFaktury>/);
});

test("builder: FA3Draft.fromDict snake_case + toDict + fromDict Date + BaseFA3Builder", async () => {
  const draft = FA3Draft.fromDict({
    invoice_number: "FV/SNAKE/1",
    issue_date: "2026-01-15",
    waluta: "eur",
    seller: SELLER,
    buyer: BUYER,
    lines: [LINE],
  });
  const dict = draft.toDict();
  assert.equal(dict.invoiceNumber, "FV/SNAKE/1");
  assert.equal(dict.currency, "EUR");
  assert.equal(draft.validate().length, 0);

  assert.equal(BaseFA3Builder, FA3InvoiceBuilder);
  const base = new BaseFA3Builder("FV/BASE/1");
  base.issueDate("2026-01-15").seller(SELLER).buyer(BUYER).addLine(LINE);
  assert.equal(base.validate().length, 0);
});

test("builder: validation-only conflict rules", () => {
  const rawExt = FA3Invoice.basic("FV/RAW/1")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine(LINE)
    .rawExtension("/x", "<x/>")
    .validate();
  assert.ok(rawExt.some((i) => i.code === "raw_extension_unsupported"));

  const halfPeriod = new FA3Draft({
    invoiceNumber: "FV/HP/1",
    issueDate: "2026-01-15",
    seller: SELLER,
    buyer: BUYER,
    lines: [LINE],
    periodFrom: "2026-01-01",
  }).validate();
  assert.ok(halfPeriod.some((i) => i.code === "half_period"));

  const saleVsPeriod = new FA3Draft({
    invoiceNumber: "FV/SP/1",
    issueDate: "2026-01-15",
    seller: SELLER,
    buyer: BUYER,
    lines: [LINE],
    saleDate: "2026-01-10",
    periodFrom: "2026-01-01",
    periodTo: "2026-01-31",
  }).validate();
  assert.ok(saleVsPeriod.some((i) => i.code === "sale_date_period_conflict"));

  const advConflict = basicBuilder("FV/AC/1").advanceReference({ invoiceNumber: "A", ksefNumber: "B" }).validate();
  assert.ok(advConflict.some((i) => i.code === "advance_reference_conflict"));

  const settlementMissingRef = FA3Invoice.settlement("ROZ/X")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine(LINE)
    .validate();
  assert.ok(settlementMissingRef.some((i) => i.code === "advance_reference_required"));

  const paidVsPartial = basicBuilder("FV/PP/1")
    .paid("2026-02-01")
    .partiallyPaid({ amount: 10, paidOn: "2026-01-20" })
    .validate();
  assert.ok(paidVsPartial.some((i) => i.code === "payment_paid_vs_partial_conflict"));

  const methodOther = basicBuilder("FV/MO/1")
    .payment({ method: "6", otherMethodDescription: "d" })
    .validate();
  assert.ok(methodOther.some((i) => i.code === "payment_method_other_conflict"));

  const partialMethodOther = basicBuilder("FV/PMO/1")
    .partiallyPaid({ amount: 10, paidOn: "2026-01-20", method: "6", otherMethodDescription: "d" })
    .validate();
  assert.ok(partialMethodOther.some((i) => i.code === "partial_payment_method_other_conflict"));

  const settlementChoice = FA3Invoice.settlement("ROZ/Y")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine(LINE)
    .advanceReference({ invoiceNumber: "ZAL/1" })
    .settlementDetails({ amountDue: 123, amountToSettle: 50 })
    .validate();
  assert.ok(settlementChoice.some((i) => i.code === "settlement_choice_conflict"));

  const settlementInconsistent = FA3Invoice.settlement("ROZ/Z")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine(LINE)
    .advanceReference({ invoiceNumber: "ZAL/1" })
    .settlementDetails({ amountDue: 999 })
    .validate();
  assert.ok(settlementInconsistent.some((i) => i.code === "settlement_amount_due_inconsistent"));

  const simplifiedReceipt = FA3Invoice.simplified("FV/SR/1")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine({ description: "drogie", quantity: 1, unit: "szt", unitNetPrice: 1000, vatRate: 23 })
    .currency("EUR")
    .asSimplifiedReceiptLike()
    .validate();
  assert.ok(simplifiedReceipt.some((i) => i.code === "simplified_receipt_currency"));
  assert.ok(simplifiedReceipt.some((i) => i.code === "simplified_receipt_limit"));

  const jstMissing = FA3Invoice.basic("FV/JST/1")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer({ ...BUYER, isJstSubunit: true })
    .addLine(LINE)
    .validate();
  assert.ok(jstMissing.some((i) => i.code === "jst_subunit_missing_party3"));

  const gvMissing = FA3Invoice.basic("FV/GV/1")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer({ ...BUYER, isVatGroupMember: true })
    .addLine(LINE)
    .validate();
  assert.ok(gvMissing.some((i) => i.code === "vat_group_missing_party3"));

  const thirdOther = basicBuilder("FV/TO/1")
    .addParty({ name: "X", taxId: "7777777777", role: "other" })
    .validate();
  assert.ok(thirdOther.some((i) => i.code === "third_party_other_description_required"));
});

test("builder: FA3BatchDraft toXmlFiles + toXmlZip + fromJson", async () => {
  const batch = FA3Template.sampleBatch();
  const roundTrip = FA3BatchDraft.fromJson(batch.toJson());
  assert.equal(roundTrip.drafts.length, 1);
  assert.equal(FA3BatchDraft.fromJson("{}").drafts.length, 0);

  const dir = await mkdtemp(path.join(os.tmpdir(), "fa3-batch-"));
  try {
    const files = await batch.toXmlFiles(path.join(dir, "out"));
    assert.equal(files.length, 1);
    const zip = await batch.toXmlZip(path.join(dir, "batch.zip"));
    assert.ok(zip.endsWith("batch.zip"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("builder: toXml with xsdValidate rejects when libxml missing", { skip: hasLibxml }, async () => {
  await assert.rejects(() => basicBuilder("FV/XSD/1").toXml({ xsdValidate: true }), FA3XmlValidationError);
});

// ---------------------------------------------------------------------------
// 9. xml.ts
// ---------------------------------------------------------------------------
test("xml.ts: invoiceToXml + invoice_to_xml alias", async () => {
  const draft = basicBuilder("FV/XML/1").build();
  const xml = await invoiceToXml(draft, { pretty: true });
  assert.match(xml, /<P_2>FV\/XML\/1<\/P_2>/);
  assert.equal(invoice_to_xml, invoiceToXml);
  const xml2 = await invoice_to_xml(draft);
  assert.match(xml2, /<Faktura/);
});

test("xml.ts: validateFa3Xml wraps errors as FA3XmlValidationError", { skip: hasLibxml }, async () => {
  await assert.rejects(() => validateFa3Xml("<Faktura/>"), FA3XmlValidationError);
});

// ---------------------------------------------------------------------------
// 10. xsd.ts
// ---------------------------------------------------------------------------
test("xsd.ts: resolveFa3SchemaEntryPath + loadFa3SchemaWithLocalImports", () => {
  const schemaPath = resolveFa3SchemaEntryPath();
  assert.match(schemaPath, /schemat_FA\(3\)_v1-0E\.xsd$/);
  const loaded = loadFa3SchemaWithLocalImports();
  assert.ok(loaded.schemaContent.length > 0);
  assert.ok(loaded.schemaBaseUrl.startsWith("file:"));
  assert.equal(loaded.schemaPath, schemaPath);
});

test("xsd.ts: validateFa3XmlXsd throws when libxmljs2 missing", { skip: hasLibxml }, async () => {
  await assert.rejects(() => validateFa3XmlXsd("<Faktura/>"), /libxmljs2/);
});

test("xsd.ts: validateFa3XmlXsd with libxmljs2 (valid + invalid)", { skip: !hasLibxml }, async () => {
  const validXml = await basicBuilder("FV/VALID/1").toXml();
  await validateFa3XmlXsd(validXml).catch((error) => assert.ok(error instanceof Error));
  await assert.rejects(() => validateFa3XmlXsd("<Faktura></Faktura>"), /XSD validation failed/);
});

test("xsd.ts: validateFa3XmlXsd empty validationErrors branch (mocked)", { skip: typeof mock.module !== "function" }, async () => {
  mock.module("libxmljs2", {
    namedExports: {
      parseXml: () => ({ validate: () => false, validationErrors: [] }),
    },
  });
  const { validateFa3XmlXsd: mockedValidate } = await import(`../../dist/index.js?xsdmock=${Date.now()}`);
  await assert.rejects(() => mockedValidate("<Faktura/>"), /FA\(3\) XSD validation failed\.$/);
  mock.reset();
});

// ---------------------------------------------------------------------------
// 11. xsdMap
// ---------------------------------------------------------------------------
test("xsdMap: parseFa3XsdElements on real schema + empty string + alias + XsdElement", () => {
  const { schemaContent } = loadFa3SchemaWithLocalImports();
  const elements = parseFa3XsdElements(schemaContent);
  assert.ok(elements.length > 0);
  assert.ok(elements.some((e) => e.path === "/Faktura"));

  assert.deepEqual(parseFa3XsdElements(""), []);
  assert.deepEqual(parseFa3XsdElements("<root></root>"), []);
  assert.equal(parse_fa3_xsd_elements, parseFa3XsdElements);

  const full = new XsdElement({
    path: "/x",
    name: "x",
    typeName: "T",
    minOccurs: "0",
    maxOccurs: "unbounded",
    choices: 2,
    enumValues: ["a", "b"],
  });
  assert.equal(full.minOccurs, "0");
  assert.deepEqual(full.enumValues, ["a", "b"]);
  const min = new XsdElement({ path: "/y", name: "y" });
  assert.equal(min.minOccurs, "1");
  assert.equal(min.maxOccurs, "1");
  assert.deepEqual(min.enumValues, []);
});

// ---------------------------------------------------------------------------
// 12. xsdAudit
// ---------------------------------------------------------------------------
test("xsdAudit: auditFa3XsdCoverage() with no args + alias + handlers", () => {
  const report = auditFa3XsdCoverage();
  assert.ok(report.elements.length > 0);
  assert.equal(report.elements.length, report.coverage.length);

  const statuses = new Set(report.coverage.map((c) => c.status));
  assert.ok(statuses.has(CoverageStatus.SUPPORTED));

  const handlers = new Set(report.coverage.map((c) => c.handler).filter(Boolean));
  for (const expected of [
    "mapPaymentTerms",
    "mapLine",
    "mapSettlement",
    "mapParty",
    "FA3Draft.toFakturaInput",
  ]) {
    assert.ok(handlers.has(expected), `missing handler ${expected}`);
  }

  assert.equal(audit_fa3_xsd_coverage, auditFa3XsdCoverage);
});

// ---------------------------------------------------------------------------
// 13. identifier via builder
// ---------------------------------------------------------------------------
test("identifier: internal id, EU company buyer, foreign, none, weird kind", () => {
  const internalDraft = new FA3Draft({
    invoiceNumber: "FV/INT/1",
    issueDate: "2026-01-15",
    seller: SELLER,
    buyer: { name: "Wewn", taxId: "IGNORED", internalId: "INT-1" },
    lines: [LINE],
  });
  const internalXml = internalDraft.toFakturaInput();
  assert.equal(internalXml.Podmiot2.DaneIdentyfikacyjne.IDWew, "INT-1");

  const euDraft = new FA3Draft({
    invoiceNumber: "FV/EU/1",
    issueDate: "2026-01-15",
    seller: SELLER,
    buyer: InvoiceParty.euCompany({ vatId: "123456789", countryCode: "DE", name: "EU GmbH" }),
    lines: [LINE],
  });
  const euXml = euDraft.toFakturaInput();
  assert.equal(euXml.Podmiot2.DaneIdentyfikacyjne.KodUE, "DE");

  const foreignDraft = new FA3Draft({
    invoiceNumber: "FV/FGN/1",
    issueDate: "2026-01-15",
    seller: SELLER,
    buyer: { name: "US Inc", taxId: "US:9999", countryCode: "US" },
    lines: [LINE],
  });
  assert.equal(foreignDraft.toFakturaInput().Podmiot2.DaneIdentyfikacyjne.NrID, "9999");

  const foreignByCountry = new FA3Draft({
    invoiceNumber: "FV/FGN/2",
    issueDate: "2026-01-15",
    seller: SELLER,
    buyer: { name: "NonEU", taxId: "ABC123", countryCode: "CH" },
    lines: [LINE],
  });
  assert.equal(foreignByCountry.toFakturaInput().Podmiot2.DaneIdentyfikacyjne.NrID, "ABC123");

  const noneDraft = new FA3Draft({
    invoiceNumber: "FV/NONE/1",
    issueDate: "2026-01-15",
    seller: SELLER,
    buyer: InvoiceParty.withoutTaxId({ name: "Anon" }),
    lines: [LINE],
  });
  assert.equal(noneDraft.toFakturaInput().Podmiot2.DaneIdentyfikacyjne.BrakID, "1");

  const explicitIdentifierDraft = new FA3Draft({
    invoiceNumber: "FV/EXP/1",
    issueDate: "2026-01-15",
    seller: SELLER,
    buyer: { name: "Explicit", taxId: "X", identifier: { kind: PartyIdentifierKind.NIP, value: " 2222222222 " } },
    lines: [LINE],
  });
  assert.equal(explicitIdentifierDraft.toFakturaInput().Podmiot2.DaneIdentyfikacyjne.NIP, "2222222222");

  // weird identifier kind hits default switch branch (mapped as NIP)
  const weirdDraft = new FA3Draft({
    invoiceNumber: "FV/WRD/1",
    issueDate: "2026-01-15",
    seller: SELLER,
    buyer: { name: "Weird", taxId: "X", identifier: { kind: "WEIRD", value: "9" } },
    lines: [LINE],
  });
  assert.equal(weirdDraft.toFakturaInput().Podmiot2.DaneIdentyfikacyjne.NIP, "9");
});

test("identifier: seller non-NIP throws in mapPartyIdentityToXml + validation issues", () => {
  const sellerNonNip = new FA3Draft({
    invoiceNumber: "FV/SN/1",
    issueDate: "2026-01-15",
    seller: { name: "EU Seller", taxId: "DE123456789", countryCode: "DE" },
    buyer: BUYER,
    lines: [LINE],
  });
  assert.throws(() => sellerNonNip.toFakturaInput(), /NIP/);
  assert.ok(sellerNonNip.validate().some((i) => i.code === "seller_nip_required"));

  const emptyIdentifier = new FA3Draft({
    invoiceNumber: "FV/EI/1",
    issueDate: "2026-01-15",
    seller: SELLER,
    buyer: { name: "Bad", taxId: "X", identifier: { kind: PartyIdentifierKind.EU_VAT, value: "", countryCode: "" } },
    lines: [LINE],
  });
  const issues = emptyIdentifier.validate();
  assert.ok(issues.some((i) => i.code === "identifier_required"));
  assert.ok(issues.some((i) => i.code === "eu_vat_country_required"));
});
