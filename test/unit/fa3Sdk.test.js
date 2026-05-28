import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { test } from "node:test";
import {
  FA3BatchDraft,
  FA3Draft,
  FA3Importer,
  FA3Invoice,
  ImportMode,
  InvoiceParty,
  KsefError,
  KsefValidationError,
  PaymentMethod,
  auditFa3XsdCoverage,
  resolveFa3SchemaEntryPath,
} from "../../dist/index.js";

test("FA3 SDK builds XML from typed builder", async () => {
  const draft = FA3Invoice.basic("FV/FA3/1")
    .issueDate("2026-05-17T10:00:00Z")
    .seller({
      name: "Sprzedawca Test",
      taxId: "1111111111",
      addressLine1: "Testowa 1",
    })
    .buyer({
      name: "Nabywca Test",
      taxId: "2222222222",
      addressLine1: "Nabywcy 2",
    })
    .addLine({
      description: "Pozycja 1",
      quantity: 1,
      unit: "szt",
      unitNetPrice: 100,
      vatRate: 23,
    })
    .build();

  const xml = await draft.toXml({ pretty: true });
  assert.match(xml, /<Faktura/);
  assert.match(xml, /<P_2>FV\/FA3\/1<\/P_2>/);
  assert.match(xml, /<FaWiersz>/);
});

test("FA3 SDK validates required data before XML generation", async () => {
  const draft = new FA3Draft({
    invoiceNumber: "",
    issueDate: "",
    seller: { name: "", taxId: "" },
    buyer: { name: "", taxId: "" },
    lines: [],
  });
  const issues = draft.validate();
  assert.ok(issues.length > 0);
  await assert.rejects(() => draft.toXml(), KsefValidationError);
});

test("FA3 SDK batch supports JSON roundtrip and ZIP export", async () => {
  const draft = FA3Invoice.settlement("FV/FA3/BATCH/1")
    .issueDate("2026-05-17T10:00:00Z")
    .seller({ name: "Sprzedawca", taxId: "1111111111" })
    .buyer({ name: "Nabywca", taxId: "2222222222" })
    .addLine({
      description: "Pozycja 1",
      quantity: 2,
      unit: "szt",
      unitNetPrice: 50,
      vatRate: 23,
    })
    .advanceReference({ invoiceNumber: "FV/ZAL/1" })
    .settlementAmount(123)
    .build();
  const batch = new FA3BatchDraft([draft]);
  const json = batch.toJson();
  const loaded = FA3BatchDraft.fromJson(json);

  const dir = await mkdtemp(path.join(os.tmpdir(), "ksef-fa3-"));
  try {
    const files = await loaded.toXmlFiles(dir);
    assert.equal(files.length, 1);
    const xmlContent = await readFile(files[0], "utf8");
    assert.match(xmlContent, /FV\/FA3\/BATCH\/1/);

    const zipPath = path.join(dir, "fa3.zip");
    const writtenZipPath = await loaded.toXmlZip(zipPath);
    assert.equal(writtenZipPath, zipPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("FA3 SDK XSD validation branch is reachable", async () => {
  const schemaPath = resolveFa3SchemaEntryPath();
  assert.ok(schemaPath.includes(path.join("dist", "documents", "fa3", "schemas")));

  const draft = FA3Invoice.basic("FV/FA3/XSD/1")
    .issueDate("2026-05-17T10:00:00Z")
    .seller({ name: "Sprzedawca", taxId: "1111111111" })
    .buyer({ name: "Nabywca", taxId: "2222222222" })
    .addLine({
      description: "Pozycja 1",
      quantity: 1,
      unit: "szt",
      unitNetPrice: 100,
      vatRate: 23,
    })
    .build();

  try {
    const xml = await draft.toXml({ xsdValidate: true });
    assert.match(xml, /<Faktura/);
  } catch (error) {
    assert.ok(error instanceof KsefError);
    assert.match(error.message, /libxmljs2|XSD validation failed/i);
  }
});

test("FA3 SDK enforces correction required fields", async () => {
  const draft = FA3Invoice.correction("KOR/1")
    .issueDate("2026-05-17T10:00:00Z")
    .seller({ name: "Sprzedawca", taxId: "1111111111" })
    .buyer({ name: "Nabywca", taxId: "2222222222" })
    .addLine({
      description: "Pozycja 1",
      quantity: 1,
      unit: "szt",
      unitNetPrice: 100,
      vatRate: 23,
    })
    .build();

  const issues = draft.validate();
  assert.ok(issues.some((issue) => issue.code === "correction_reason_required"));
  assert.ok(issues.some((issue) => issue.code === "corrected_invoice_number_required"));
  assert.ok(issues.some((issue) => issue.code === "corrected_invoice_date_required"));
  await assert.rejects(() => draft.toXml(), KsefValidationError);
});

test("FA3 SDK settlement validates amount consistency and advance reference choice", async () => {
  const draft = FA3Invoice.settlement("ROZ/1")
    .issueDate("2026-05-17T10:00:00Z")
    .seller({ name: "Sprzedawca", taxId: "1111111111" })
    .buyer({ name: "Nabywca", taxId: "2222222222" })
    .addLine({
      description: "Pozycja 1",
      quantity: 1,
      unit: "szt",
      unitNetPrice: 100,
      vatRate: 23,
    })
    .advanceReference({
      invoiceNumber: "FV/ZAL/1",
      ksefNumber: "1234567890-20260101-AAAA-BB",
    })
    .settlementDetails({
      amountDue: "999.00",
      charges: [{ amount: "1.00", reason: "charge" }],
      deductions: [{ amount: "1.00", reason: "deduction" }],
    })
    .build();

  const issues = draft.validate();
  assert.ok(issues.some((issue) => issue.code === "advance_reference_conflict"));
  assert.ok(issues.some((issue) => issue.code === "settlement_amount_due_inconsistent"));
  await assert.rejects(() => draft.toXml(), KsefValidationError);
});

test("FA3 SDK validates XML-shape conflicts", async () => {
  const draft = FA3Invoice.basic("FV/SHAPE/1")
    .issueDate("2026-05-17T10:00:00Z")
    .saleDate("2026-05-17")
    .period("2026-05-01", "2026-05-31")
    .seller({ name: "Sprzedawca", taxId: "1111111111" })
    .buyer({ name: "Nabywca", taxId: "2222222222" })
    .addLine({
      description: "Pozycja 1",
      quantity: 1,
      unit: "szt",
      unitNetPrice: 100,
      vatRate: 23,
    })
    .payment({
      paidDate: "2026-05-17",
      partialPayments: [{ amount: "10.00", paidOn: "2026-05-17" }],
      method: "transfer",
      otherMethodDescription: "inne",
    })
    .build();

  const issues = draft.validate();
  assert.ok(issues.some((issue) => issue.code === "sale_date_period_conflict"));
  assert.ok(issues.some((issue) => issue.code === "payment_paid_vs_partial_conflict"));
  assert.ok(issues.some((issue) => issue.code === "payment_method_other_conflict"));
  await assert.rejects(() => draft.toXml(), KsefValidationError);
});

test("FA3 SDK supports correction before/after delta lines", async () => {
  const draft = FA3Invoice.correction("KOR/DELTA/1")
    .issueDate("2026-05-17T10:00:00Z")
    .seller({ name: "Sprzedawca", taxId: "1111111111" })
    .buyer({ name: "Nabywca", taxId: "2222222222" })
    .correction({
      reason: "Korekta ceny",
      correctedInvoiceNumber: "FV/OLD/1",
      correctedInvoiceDate: "2026-05-01",
    })
    .addCorrectedLineBeforeAfter({
      before: {
        description: "Usługa",
        quantity: 1,
        unit: "szt",
        unitNetPrice: 200,
        vatRate: 23,
      },
      after: {
        description: "Usługa",
        quantity: 1,
        unit: "szt",
        unitNetPrice: 100,
        vatRate: 23,
      },
    })
    .build();

  const xml = await draft.toXml();
  assert.match(xml, /<StanPrzed>1<\/StanPrzed>/);
  assert.match(xml, /<P_13_1>-100.00<\/P_13_1>/);
});

test("FA3 audit helper returns coverage report", () => {
  const report = auditFa3XsdCoverage(["Faktura", "Naglowek"]);
  assert.ok(report.elements.length > 0);
  assert.ok(report.coverage.length > 0);
  assert.equal(report.elements.length, report.coverage.length);
  assert.ok(report.coverage.some((entry) => entry.status === "unsupported"));
  assert.ok(report.coverage.some((entry) => entry.status === "partially_supported"));
});

test("FA3 simplified receipt-like guards enforce PLN and 450 limit", async () => {
  const draft = FA3Invoice.simplified("UPR/1")
    .issueDate("2026-05-17T10:00:00Z")
    .currency("EUR")
    .seller({ name: "Sprzedawca", taxId: "1111111111" })
    .buyer({ name: "Nabywca", taxId: "2222222222" })
    .addLine({
      description: "Pozycja 1",
      quantity: 1,
      unit: "szt",
      unitNetPrice: 500,
      vatRate: 23,
    })
    .asSimplifiedReceiptLike()
    .build();

  const issues = draft.validate();
  assert.ok(issues.some((issue) => issue.code === "simplified_receipt_currency"));
  assert.ok(issues.some((issue) => issue.code === "simplified_receipt_limit"));
  await assert.rejects(() => draft.toXml(), KsefValidationError);
});

test("FA3 importer handles json payload and validate-only mode", () => {
  const payload = {
    drafts: [
      {
        invoiceNumber: "FV/IMPORT/1",
        issueDate: "2026-05-17",
        seller: { name: "Sprzedawca", taxId: "1111111111" },
        buyer: { name: "Nabywca", taxId: "2222222222" },
        lines: [{ description: "Pozycja", quantity: 1, unit: "szt", unitNetPrice: 100, vatRate: 23 }],
      },
    ],
  };

  const parsed = FA3Importer.fromJson(payload);
  assert.equal(parsed.validDrafts.length, 1);
  assert.equal(parsed.errors.length, 0);

  const validateOnly = FA3Importer.fromJson(payload, { mode: ImportMode.VALIDATE_ONLY });
  assert.equal(validateOnly.validDrafts.length, 0);
  assert.equal(validateOnly.errors.length, 0);
});

test("FA3 maps payment aliases to FA(3) payment codes in XML", async () => {
  const draft = FA3Invoice.basic("FV/PAY/1")
    .issueDate("2026-05-17T10:00:00Z")
    .seller({ name: "Sprzedawca", taxId: "1111111111" })
    .buyer({ name: "Nabywca", taxId: "2222222222" })
    .addServiceLine("Usługa", { quantity: 1, unitNetPrice: 100, vatRate: 23 })
    .payment({ method: PaymentMethod.TRANSFER })
    .build();

  const xml = await draft.toXml();
  assert.match(xml, /<FormaPlatnosci>6<\/FormaPlatnosci>/);
});

test("FA3 maps third parties, foreign identifiers, JST and VAT group flags", async () => {
  const draft = FA3Invoice.basic("FV/PARTIES/1")
    .issueDate("2026-05-17T10:00:00Z")
    .seller({ name: "Sprzedawca", taxId: "1111111111" })
    .buyer({
      name: "Nabywca UE",
      taxId: "DE123456789",
      countryCode: "DE",
      isJstSubunit: true,
      isVatGroupMember: true,
    })
    .addParty({
      name: "Jednostka JST",
      taxId: "BRAK",
      role: "jst_subunit",
      addressLine1: "Jednostki 1",
    })
    .addParty({
      name: "Członek GV",
      taxId: "3333333333",
      role: "vat_group_member",
    })
    .addParty({
      name: "Płatnik zagraniczny",
      taxId: "US:998877",
      countryCode: "US",
      role: "payer",
      share: "25",
    })
    .addServiceLine("Usługa", { quantity: 1, unitNetPrice: 100, vatRate: 23 })
    .build();

  const xml = await draft.toXml();
  assert.match(xml, /<KodUE>DE<\/KodUE>/);
  assert.match(xml, /<NrVatUE>123456789<\/NrVatUE>/);
  assert.match(xml, /<JST>1<\/JST>/);
  assert.match(xml, /<GV>1<\/GV>/);
  assert.match(xml, /<Podmiot3>/);
  assert.match(xml, /<BrakID>1<\/BrakID>/);
  assert.match(xml, /<Rola>8<\/Rola>/);
  assert.match(xml, /<Rola>10<\/Rola>/);
  assert.match(xml, /<KodKraju>US<\/KodKraju>/);
  assert.match(xml, /<NrID>998877<\/NrID>/);
  assert.match(xml, /<Rola>4<\/Rola>/);
  assert.match(xml, /<Udzial>25<\/Udzial>/);
});

test("FA3 maps XSD payment terms including partial payments, account and payment link", async () => {
  const draft = FA3Invoice.basic("FV/PAYMENT/1")
    .issueDate("2026-05-17T10:00:00Z")
    .seller({ name: "Sprzedawca", taxId: "1111111111" })
    .buyer({ name: "Nabywca", taxId: "2222222222" })
    .addServiceLine("Usługa", { quantity: 1, unitNetPrice: 100, vatRate: 23 })
    .paymentDueDescription(14, "dni", "doręczenia", "transfer")
    .partiallyPaid({ amount: "23.00", paidOn: "2026-05-18", method: "card" })
    .bankAccount({
      number: "12109010140000071219812874",
      swift: "WBKPPLPP",
      bankName: "Bank Test",
      description: "Rachunek główny",
    })
    .paymentLink("https://pay.example.com/checkout?IPKSeF=123ABCDEFGHIJ", "123ABCDEFGHIJ")
    .build();

  const xml = await draft.toXml();
  assert.match(xml, /<ZnacznikZaplatyCzesciowej>1<\/ZnacznikZaplatyCzesciowej>/);
  assert.match(xml, /<KwotaZaplatyCzesciowej>23.00<\/KwotaZaplatyCzesciowej>/);
  assert.match(xml, /<TerminOpis>/);
  assert.match(xml, /<Ilosc>14<\/Ilosc>/);
  assert.match(xml, /<FormaPlatnosci>6<\/FormaPlatnosci>/);
  assert.match(xml, /<RachunekBankowy>/);
  assert.match(xml, /<NrRB>12109010140000071219812874<\/NrRB>/);
  assert.match(xml, /<LinkDoPlatnosci>https:\/\/pay.example.com\/checkout\?IPKSeF=123ABCDEFGHIJ<\/LinkDoPlatnosci>/);
  assert.match(xml, /<IPKSeF>123ABCDEFGHIJ<\/IPKSeF>/);
});

test("FA3 maps settlement adjustments into Rozliczenie section", async () => {
  const draft = FA3Invoice.settlement("ROZ/MAP/1")
    .issueDate("2026-05-17T10:00:00Z")
    .seller({ name: "Sprzedawca", taxId: "1111111111" })
    .buyer({ name: "Nabywca", taxId: "2222222222" })
    .addServiceLine("Usługa", { quantity: 1, unitNetPrice: 100, vatRate: 23 })
    .advanceReference({ invoiceNumber: "FV/ZAL/1" })
    .settlementDetails({
      amountDue: "125.00",
      charges: [{ amount: "3.00", reason: "Dopłata" }],
      deductions: [{ amount: "1.00", reason: "Rabat" }],
    })
    .build();

  const xml = await draft.toXml();
  assert.match(xml, /<Rozliczenie>/);
  assert.match(xml, /<Obciazenia>/);
  assert.match(xml, /<SumaObciazen>3.00<\/SumaObciazen>/);
  assert.match(xml, /<Odliczenia>/);
  assert.match(xml, /<SumaOdliczen>1.00<\/SumaOdliczen>/);
  assert.match(xml, /<DoZaplaty>125.00<\/DoZaplaty>/);
});

test("FA3 exports all invoice kinds with expected RodzajFaktury code", async () => {
  const matrix = [
    ["basic", "VAT"],
    ["simplified", "UPR"],
    ["correction", "KOR"],
    ["advance", "ZAL"],
    ["settlement", "ROZ"],
    ["advance_correction", "KOR_ZAL"],
    ["settlement_correction", "KOR_ROZ"],
  ];

  for (const [kind, code] of matrix) {
    let builder;
    switch (kind) {
      case "basic":
        builder = FA3Invoice.basic(`FV/${code}/1`);
        break;
      case "simplified":
        builder = FA3Invoice.simplified(`FV/${code}/1`);
        break;
      case "correction":
        builder = FA3Invoice.correction(`FV/${code}/1`).correction({
          reason: "Korekta",
          correctedInvoiceNumber: "FV/OLD/1",
          correctedInvoiceDate: "2026-01-01",
        });
        break;
      case "advance":
        builder = FA3Invoice.advance(`FV/${code}/1`);
        break;
      case "settlement":
        builder = FA3Invoice
          .settlement(`FV/${code}/1`)
          .advanceReference({ invoiceNumber: "FV/ZAL/1" })
          .settlementAmount("123.00");
        break;
      case "advance_correction":
        builder = FA3Invoice.advanceCorrection(`FV/${code}/1`).correction({
          reason: "Korekta zaliczki",
          correctedInvoiceNumber: "FV/ZAL/1",
          correctedInvoiceDate: "2026-01-01",
        });
        break;
      default:
        builder = FA3Invoice
          .settlementCorrection(`FV/${code}/1`)
          .correction({
            reason: "Korekta rozliczenia",
            correctedInvoiceNumber: "FV/ROZ/1",
            correctedInvoiceDate: "2026-01-01",
          })
          .advanceReference({ invoiceNumber: "FV/ZAL/1" })
          .settlementAmount("123.00");
    }

    const draft = builder
      .issueDate("2026-05-17T10:00:00Z")
      .seller({ name: "Sprzedawca", taxId: "1111111111" })
      .buyer({ name: "Nabywca", taxId: "2222222222" })
      .addLine({
        description: "Pozycja",
        quantity: 1,
        unit: "szt",
        unitNetPrice: 100,
        vatRate: 23,
      })
      .build();

    const xml = await draft.toXml();
    assert.match(xml, new RegExp(`<RodzajFaktury>${code}</RodzajFaktury>`));
  }
});

test("FA3 maps contract/order/transport/transaction/attachment sections into XML", async () => {
  const draft = FA3Invoice.basic("FV/SECTIONS/1")
    .issueDate("2026-05-17T10:00:00Z")
    .seller({ name: "Sprzedawca", taxId: "1111111111" })
    .buyer({ name: "Nabywca", taxId: "2222222222" })
    .addServiceLine("Usługa", { quantity: 1, unitNetPrice: 1000, vatRate: 23 })
    .contract("UM/1/2026", "2026-01-01")
    .orderReference("ZAM/1/2026", "2026-01-02")
    .order("1230.00")
    .orderLine({
      description: "Pozycja zamówienia",
      quantity: 1,
      unitNetPrice: 1000,
      vatRate: 23,
    })
    .transactionTerms({
      deliveryTerms: "DAP",
      contractualRate: "4.123456",
      contractualCurrency: "EUR",
      intermediary: true,
    })
    .transport("3", { orderNumber: "TR/1", cargoDescription: "1", packageUnit: "paleta" })
    .additionalDescription("kanał", "API")
    .attachment({
      blocks: [
        {
          header: "Załącznik",
          paragraphs: ["Opis"],
          tables: [{ headers: ["Nazwa", "Kwota"], rows: [["Pozycja", "1230.00"]] }],
        },
      ],
    })
    .build();

  const xml = await draft.toXml();
  assert.match(xml, /<Umowy>/);
  assert.match(xml, /<Zamowienia>/);
  assert.match(xml, /<Zamowienie>/);
  assert.match(xml, /<WarunkiTransakcji>/);
  assert.match(xml, /<Transport>/);
  assert.match(xml, /<DodatkowyOpis>/);
  assert.match(xml, /<Zalacznik>/);
});

test("FA3 rejects non-NIP seller identifier like Python SDK", async () => {
  const draft = FA3Invoice.basic("FV/BAD/1")
    .issueDate("2026-05-17")
    .seller(
      InvoiceParty.foreignCompany({
        identifier: "SELLER",
        countryCode: "DE",
        name: "Zły sprzedawca",
      }),
    )
    .buyer({ name: "Nabywca", taxId: "2222222222" })
    .addServiceLine("Line", { quantity: 1, unitNetPrice: 100, vatRate: 23 })
    .build();

  const issues = draft.validate();
  assert.ok(
    issues.some((issue) => issue.message.includes("Podmiot1")),
    "expected Podmiot1 NIP validation issue",
  );

  await assert.rejects(
    () => draft.toXml(),
    (error) => error instanceof KsefValidationError && /Podmiot1/.test(error.message),
  );
});

test("FA3 PartyIdentifier factories set explicit identifier on parties", () => {
  const seller = InvoiceParty.polishCompany({
    nip: "1111111111",
    name: "Sprzedawca",
  });
  assert.equal(seller.identifier?.kind, "NIP");
  assert.equal(seller.identifier?.value, "1111111111");

  const buyer = InvoiceParty.withoutTaxId({ name: "Osoba fizyczna" });
  assert.equal(buyer.identifier?.kind, "NONE");
});
