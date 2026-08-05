import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FA3Invoice,
  TaxSummary,
  faVatBucketForCode,
  resolveVatRateCode,
  taxSummaryToFaFields,
} from "../../dist/index.js";

test("resolveVatRateCode prefers vatCode over numeric vatRate", () => {
  assert.equal(
    resolveVatRateCode({
      description: "x",
      quantity: 1,
      unit: "szt",
      unitNetPrice: 1,
      vatRate: 0,
      vatCode: "zw",
    }),
    "zw",
  );
  assert.equal(
    resolveVatRateCode({
      description: "x",
      quantity: 1,
      unit: "szt",
      unitNetPrice: 1,
      vatRate: null,
    }),
    "0 KR",
  );
  assert.equal(
    resolveVatRateCode({
      description: "x",
      quantity: 1,
      unit: "szt",
      unitNetPrice: 1,
      vatRate: 23,
    }),
    "23",
  );
  assert.equal(faVatBucketForCode("8"), "8or7");
  assert.equal(faVatBucketForCode("0 KR"), "0KR");
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
