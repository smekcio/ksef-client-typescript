import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FA3Invoice,
  TaxSummary,
  faVatBucketForCode,
  resolveVatRateCode,
  taxSummaryToFaFields,
} from "../../dist/index.js";

const line = (overrides = {}) => ({
  description: "x",
  quantity: 1,
  unit: "szt",
  unitNetPrice: 1,
  ...overrides,
});

test("resolveVatRateCode prefers vatCode over numeric vatRate", () => {
  assert.equal(resolveVatRateCode(line({ vatRate: 0, vatCode: "zw" })), "zw");
  assert.equal(resolveVatRateCode(line({ vatRate: null })), "0 KR");
  assert.equal(resolveVatRateCode(line({ vatRate: undefined })), "0 KR");
  assert.equal(resolveVatRateCode(line({ vatRate: "" })), "0 KR");
  assert.equal(resolveVatRateCode(line({ vatRate: 23 })), "23");
  assert.equal(resolveVatRateCode(line({ vatRate: 0 })), "0 KR");
  assert.equal(resolveVatRateCode(line({ vatRate: "0" })), "0 KR");
  assert.equal(resolveVatRateCode(line({ vatRate: "zw" })), "zw");
  assert.equal(resolveVatRateCode(line({ vatRate: "np II" })), "np II");
  assert.equal(faVatBucketForCode("8"), "8or7");
  assert.equal(faVatBucketForCode("0 KR"), "0KR");
});

test("faVatBucketForCode covers all FA rate codes", () => {
  const cases = [
    ["23", "23or22"],
    ["22", "23or22"],
    ["8", "8or7"],
    ["7", "8or7"],
    ["5", "5"],
    ["4", "4or3"],
    ["3", "4or3"],
    ["0 KR", "0KR"],
    ["0 WDT", "0WDT"],
    ["0 EX", "0EX"],
    ["zw", "zw"],
    ["np I", "npI"],
    ["np II", "npII"],
    ["oo", "oo"],
  ];
  for (const [code, expected] of cases) {
    assert.equal(faVatBucketForCode(code), expected, `code=${String(code)}`);
  }
});

test("faVatBucketForCode throws on empty or unknown codes", () => {
  for (const code of ["", null, undefined, "unknown", "23%"]) {
    assert.throws(
      () => faVatBucketForCode(code),
      /Unknown FA\(3\) VAT rate code/,
      `code=${String(code)}`,
    );
  }
});

test("TaxSummary groups by FA vatCode", () => {
  const rows = TaxSummary.fromLines([
    {
      description: "a",
      quantity: 1,
      unit: "szt",
      unitNetPrice: 100,
      vatRate: 23,
      vatCode: "23",
      netAmount: 100,
      vatAmount: 23,
      grossAmount: 123,
    },
    {
      description: "b",
      quantity: 1,
      unit: "szt",
      unitNetPrice: 50,
      vatRate: 8,
      vatCode: "8",
      netAmount: 50,
      vatAmount: 4,
      grossAmount: 54,
    },
  ]);
  assert.equal(rows.length, 2);
  const fields = taxSummaryToFaFields(rows);
  assert.equal(fields.P_13_1, "100.00");
  assert.equal(fields.P_14_1, "23.00");
  assert.equal(fields.P_13_2, "50.00");
  assert.equal(fields.P_14_2, "4.00");
  assert.equal(fields.P_13_7, undefined);
});

test("FA3 XML splits VAT summary for rates 23 and 8", async () => {
  const xml = await FA3Invoice.basic("FV/MIX/1")
    .issueDate("2026-08-01")
    .seller({ name: "Sprzedawca", taxId: "1111111111", addressLine1: "A 1" })
    .buyer({ name: "Nabywca", taxId: "2222222222", addressLine1: "B 2" })
    .addLine({
      description: "Usługa 23%",
      quantity: 1,
      unit: "szt",
      unitNetPrice: 100,
      vatRate: 23,
      vatCode: "23",
      netAmount: 100,
      vatAmount: 23,
      grossAmount: 123,
    })
    .addLine({
      description: "Usługa 8%",
      quantity: 1,
      unit: "szt",
      unitNetPrice: 50,
      vatRate: 8,
      vatCode: "8",
      netAmount: 50,
      vatAmount: 4,
      grossAmount: 54,
    })
    .toXml();

  assert.match(xml, /<P_13_1>100\.00<\/P_13_1>/);
  assert.match(xml, /<P_14_1>23\.00<\/P_14_1>/);
  assert.match(xml, /<P_13_2>50\.00<\/P_13_2>/);
  assert.match(xml, /<P_14_2>4\.00<\/P_14_2>/);
  assert.match(xml, /<P_15>177\.00<\/P_15>/);
  assert.doesNotMatch(xml, /<P_13_1>150\.00<\/P_13_1>/);
  assert.match(xml, /<P_12>23<\/P_12>/);
  assert.match(xml, /<P_12>8<\/P_12>/);
});

test("FA3 XML uses P_13_7 for zw vatCode", async () => {
  const xml = await FA3Invoice.basic("FV/ZW/1")
    .issueDate("2026-08-01")
    .seller({ name: "Sprzedawca", taxId: "1111111111", addressLine1: "A 1" })
    .buyer({ name: "Nabywca", taxId: "2222222222", addressLine1: "B 2" })
    .addLine({
      description: "Zwolnione",
      quantity: 1,
      unit: "szt",
      unitNetPrice: 100,
      vatRate: 0,
      vatCode: "zw",
      netAmount: 100,
      vatAmount: 0,
      grossAmount: 100,
    })
    .toXml();

  assert.match(xml, /<P_13_7>100\.00<\/P_13_7>/);
  assert.match(xml, /<P_12>zw<\/P_12>/);
  assert.doesNotMatch(xml, /<P_13_1>/);
  assert.doesNotMatch(xml, /<P_14_1>/);
});

test("FA3 XML uses P_13_6_1 for 0 KR", async () => {
  const xml = await FA3Invoice.basic("FV/0KR/1")
    .issueDate("2026-08-01")
    .seller({ name: "Sprzedawca", taxId: "1111111111", addressLine1: "A 1" })
    .buyer({ name: "Nabywca", taxId: "2222222222", addressLine1: "B 2" })
    .addLine({
      description: "Zero",
      quantity: 1,
      unit: "szt",
      unitNetPrice: 80,
      vatRate: 0,
      vatCode: "0 KR",
      netAmount: 80,
      vatAmount: 0,
      grossAmount: 80,
    })
    .toXml();

  assert.match(xml, /<P_13_6_1>80\.00<\/P_13_6_1>/);
  assert.match(xml, /<P_12>0 KR<\/P_12>/);
  assert.doesNotMatch(xml, /<P_13_1>/);
});

test("FA3 XML emits P_12 0 KR when vatRate is 0 without vatCode", async () => {
  const xml = await FA3Invoice.basic("FV/0KR/2")
    .issueDate("2026-08-01")
    .seller({ name: "Sprzedawca", taxId: "1111111111", addressLine1: "A 1" })
    .buyer({ name: "Nabywca", taxId: "2222222222", addressLine1: "B 2" })
    .addLine({
      description: "Zero legacy",
      quantity: 1,
      unit: "szt",
      unitNetPrice: 40,
      vatRate: 0,
      netAmount: 40,
      vatAmount: 0,
      grossAmount: 40,
    })
    .toXml();

  assert.match(xml, /<P_12>0 KR<\/P_12>/);
  assert.doesNotMatch(xml, /<P_12>0<\/P_12>/);
  assert.match(xml, /<P_13_6_1>40\.00<\/P_13_6_1>/);
});

test("FA3 XML emits P_14_1W for foreign currency vatAmountPln", async () => {
  const xml = await FA3Invoice.basic("FV/FX/1")
    .issueDate("2026-08-01")
    .currency("EUR")
    .seller({ name: "Sprzedawca", taxId: "1111111111", addressLine1: "A 1" })
    .buyer({ name: "Nabywca", taxId: "2222222222", addressLine1: "B 2" })
    .addLine({
      description: "Usługa EUR",
      quantity: 1,
      unit: "szt",
      unitNetPrice: 100,
      vatRate: 23,
      vatCode: "23",
      netAmount: 100,
      vatAmount: 23,
      grossAmount: 123,
      vatAmountPln: 103.5,
    })
    .toXml();

  assert.match(xml, /<KodWaluty>EUR<\/KodWaluty>/);
  assert.match(xml, /<P_14_1>23\.00<\/P_14_1>/);
  assert.match(xml, /<P_14_1W>103\.50<\/P_14_1W>/);
});

test("correction before/after lines produce signed VAT bucket delta", async () => {
  const xml = await FA3Invoice.correction("KOR/MIX/1")
    .issueDate("2026-08-01")
    .seller({ name: "Sprzedawca", taxId: "1111111111", addressLine1: "A 1" })
    .buyer({ name: "Nabywca", taxId: "2222222222", addressLine1: "B 2" })
    .correction({
      reason: "Korekta",
      correctedInvoiceNumber: "FV/OLD/1",
      correctedInvoiceDate: "2026-07-01",
    })
    .addCorrectedLineBeforeAfter({
      before: {
        description: "Usługa 23%",
        quantity: 1,
        unit: "szt",
        unitNetPrice: 200,
        vatRate: 23,
        vatCode: "23",
      },
      after: {
        description: "Usługa 23%",
        quantity: 1,
        unit: "szt",
        unitNetPrice: 100,
        vatRate: 23,
        vatCode: "23",
      },
    })
    .toXml();

  assert.match(xml, /<P_13_1>-100\.00<\/P_13_1>/);
  assert.match(xml, /<P_14_1>-23\.00<\/P_14_1>/);
});

test("TaxSummary signs beforeCorrection and maps vatAmountPln", () => {
  const rows = TaxSummary.fromLines(
    [
      line({
        vatRate: 23,
        vatCode: "23",
        netAmount: 200,
        vatAmount: 46,
        grossAmount: 246,
        vatAmountPln: 200,
        beforeCorrection: true,
      }),
      line({
        vatRate: 23,
        vatCode: "23",
        netAmount: 100,
        vatAmount: 23,
        grossAmount: 123,
        vatAmountPln: 100,
      }),
      // Explicit empty vatAmountPln is ignored; computed VAT from rate when vatAmount absent.
      line({
        quantity: "2",
        unitNetPrice: "10,5",
        vatRate: 8,
        vatCode: "8",
        vatAmountPln: "",
      }),
    ],
    { treatBeforeCorrectionAsNegative: true },
  );
  assert.equal(rows.length, 2);
  const byCode = Object.fromEntries(rows.map((r) => [r.rateCode, r]));
  assert.equal(byCode["23"].net, -100);
  assert.equal(byCode["23"].vat, -23);
  assert.equal(byCode["23"].vatPln, -100);
  assert.equal(byCode["8"].net, 21);
  assert.equal(byCode["8"].vat, 1.68);
  const fields = taxSummaryToFaFields(rows, { includeVatPln: true });
  assert.equal(fields.P_13_1, "-100.00");
  assert.equal(fields.P_14_1, "-23.00");
  assert.equal(fields.P_14_1W, "-100.00");
  assert.equal(fields.P_13_2, "21.00");
  // Without includeVatPln, P_14_*W stays unset.
  const fieldsNoPln = taxSummaryToFaFields(rows);
  assert.equal(fieldsNoPln.P_14_1W, undefined);
});

test("TaxSummary computes zero VAT when vatRate is zero without vatAmount", () => {
  const rows = TaxSummary.fromLines([
    line({ quantity: 1, unitNetPrice: 50, vatRate: 0 }),
    line({ quantity: Number.POSITIVE_INFINITY, unitNetPrice: "x", vatRate: 23, vatAmountPln: null }),
  ]);
  assert.equal(rows[0].rateCode, "0 KR");
  assert.equal(rows[0].net, 50);
  assert.equal(rows[0].vat, 0);
  assert.equal(rows[1].net, 0);
  const withPln = taxSummaryToFaFields(
    [
      { rateCode: "23", net: 10, vat: 2.3, gross: 12.3 },
      { rateCode: "23", net: 5, vat: 1.15, gross: 6.15, vatPln: 2 },
    ],
    { includeVatPln: true },
  );
  assert.equal(withPln.P_13_1, "15.00");
  assert.equal(withPln.P_14_1W, "2.00");
  const badQty = TaxSummary.fromLines([
    line({ quantity: "not-a-number", unitNetPrice: "", vatRate: undefined }),
  ]);
  assert.equal(badQty[0].net, 0);
});

test("taxSummaryToFaFields maps zero-rate and special codes without VAT tags", () => {
  const rows = TaxSummary.fromLines([
    line({ vatRate: "zw", netAmount: 10, vatAmount: 0, grossAmount: 10 }),
    line({ vatRate: "0 WDT", netAmount: 20, vatAmount: 0, grossAmount: 20 }),
    line({ vatRate: "0 EX", netAmount: 30, vatAmount: 0, grossAmount: 30 }),
    line({ vatRate: "np I", netAmount: 40, vatAmount: 0, grossAmount: 40 }),
    line({ vatRate: "np II", netAmount: 50, vatAmount: 0, grossAmount: 50 }),
    line({ vatRate: "oo", netAmount: 60, vatAmount: 0, grossAmount: 60 }),
    line({ vatRate: 5, vatCode: "5", netAmount: 70, vatAmount: 3.5, grossAmount: 73.5 }),
    line({ vatRate: 4, vatCode: "4", netAmount: 80, vatAmount: 3.2, grossAmount: 83.2 }),
  ]);
  const fields = taxSummaryToFaFields(rows);
  assert.equal(fields.P_13_7, "10.00");
  assert.equal(fields.P_13_6_2, "20.00");
  assert.equal(fields.P_13_6_3, "30.00");
  assert.equal(fields.P_13_8, "40.00");
  assert.equal(fields.P_13_9, "50.00");
  assert.equal(fields.P_13_10, "60.00");
  assert.equal(fields.P_13_3, "70.00");
  assert.equal(fields.P_14_3, "3.50");
  assert.equal(fields.P_13_4, "80.00");
  assert.equal(fields.P_14_4, "3.20");
  assert.equal(fields.P_14_7, undefined);
});

test("addGoodsLine accepts vatCode, vatAmountPln and explicit amounts", async () => {
  const xml = await FA3Invoice.basic("FV/GOODS/1")
    .issueDate("2026-08-01")
    .currency("EUR")
    .seller({ name: "Sprzedawca", taxId: "1111111111", addressLine1: "A 1" })
    .buyer({ name: "Nabywca", taxId: "2222222222", addressLine1: "B 2" })
    .addGoodsLine("Towar", {
      quantity: 1,
      unitNetPrice: 100,
      unit: "szt",
      vatRate: 23,
      vatCode: "23",
      vatAmountPln: 50.25,
      netAmount: 100,
      vatAmount: 23,
      grossAmount: 123,
    })
    .toXml();

  assert.match(xml, /<P_12>23<\/P_12>/);
  assert.match(xml, /<P_13_1>100\.00<\/P_13_1>/);
  assert.match(xml, /<P_14_1>23\.00<\/P_14_1>/);
  assert.match(xml, /<P_14_1W>50\.25<\/P_14_1W>/);
});

test("advance invoice puts advancePayment VAT into P_13_1/P_14_1", async () => {
  const xml = await FA3Invoice.advance("ZAL/1")
    .issueDate("2026-08-01")
    .seller({ name: "Sprzedawca", taxId: "1111111111", addressLine1: "A 1" })
    .buyer({ name: "Nabywca", taxId: "2222222222", addressLine1: "B 2" })
    .advancePayment({ amount: 123, vatRate: 23 })
    .toXml();

  assert.match(xml, /<RodzajFaktury>ZAL<\/RodzajFaktury>/);
  assert.match(xml, /<ZaliczkaCzesciowa>/);
  assert.match(xml, /<P_13_1>100\.00<\/P_13_1>/);
  assert.match(xml, /<P_14_1>23\.00<\/P_14_1>/);
  assert.match(xml, /<P_15>123\.00<\/P_15>/);
  assert.doesNotMatch(xml, /<FaWiersz>/);
});

test("advance invoice splits mixed advancePayment VAT rates", async () => {
  const xml = await FA3Invoice.advance("ZAL/MIX/1")
    .issueDate("2026-08-01")
    .seller({ name: "Sprzedawca", taxId: "1111111111", addressLine1: "A 1" })
    .buyer({ name: "Nabywca", taxId: "2222222222", addressLine1: "B 2" })
    .advancePayment({ amount: 123, vatRate: 23 })
    .advancePayment({ amount: 54, vatRate: 8 })
    .toXml();

  assert.match(xml, /<P_13_1>100\.00<\/P_13_1>/);
  assert.match(xml, /<P_14_1>23\.00<\/P_14_1>/);
  assert.match(xml, /<P_13_2>50\.00<\/P_13_2>/);
  assert.match(xml, /<P_14_2>4\.00<\/P_14_2>/);
  assert.match(xml, /<P_15>177\.00<\/P_15>/);
});

test("advance payment without vatRate uses P_13_6_1", async () => {
  const xml = await FA3Invoice.advance("ZAL/0/1")
    .issueDate("2026-08-01")
    .seller({ name: "Sprzedawca", taxId: "1111111111", addressLine1: "A 1" })
    .buyer({ name: "Nabywca", taxId: "2222222222", addressLine1: "B 2" })
    .advancePayment({ amount: 80 })
    .toXml();

  assert.match(xml, /<P_13_6_1>80\.00<\/P_13_6_1>/);
  assert.doesNotMatch(xml, /<P_13_1>/);
  assert.doesNotMatch(xml, /<P_14_1>/);
  assert.match(xml, /<P_15>80\.00<\/P_15>/);
});
