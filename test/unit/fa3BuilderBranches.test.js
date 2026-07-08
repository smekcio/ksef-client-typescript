import assert from "node:assert/strict";
import { test } from "node:test";
import { FA3Draft, FA3Invoice, PartyIdentifierKind } from "../../dist/index.js";

const SELLER = { name: "Sprzedawca Sp. z o.o.", taxId: "1111111111", addressLine1: "ul. A 1" };
const BUYER = { name: "Nabywca Sp. z o.o.", taxId: "2222222222", addressLine1: "ul. B 2" };
const LINE = { description: "Usługa", quantity: 1, unit: "szt", unitNetPrice: 100, vatRate: 23 };

test("builder.ts: additional party defaults and optional party fields", async () => {
  const xml = await FA3Invoice.basic("FV/P3/1")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine(LINE)
    .addParty({ name: "DefaultRole", taxId: "7777777777" })
    .toXml();
  assert.match(xml, /<Rola>2<\/Rola>/);
});

test("builder.ts: correction totals, advance totals and validation edges", async () => {
  const correctionSign = await FA3Invoice.correction("KOR/SIGN/1")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine({ ...LINE, beforeCorrection: true })
    .addLine({ ...LINE, description: "Po", beforeCorrection: false })
    .correction({ reason: "r", correctedInvoiceNumber: "FV/1", correctedInvoiceDate: "2025-12-01" })
    .toXml();
  assert.match(correctionSign, /<StanPrzed>1<\/StanPrzed>/);

  const advanceTotals = await FA3Invoice.basic("FV/AT/1")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine(LINE)
    .advancePayment({ amount: 50, vatRate: 8 })
    .toXml();
  assert.match(advanceTotals, /<P_15>/);

  const emptyLines = new FA3Draft({
    invoiceNumber: "FV/EL/1",
    issueDate: "2026-01-15",
    seller: SELLER,
    buyer: BUYER,
    lines: [],
  });
  assert.ok(emptyLines.validate().some((issue) => issue.code === "lines_required"));
});

test("builder.ts: payment and settlement optional branches", async () => {
  const paymentMinimal = await FA3Invoice.basic("FV/PAYM/1")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine(LINE)
    .payment({ otherMethodDescription: "Barter" })
    .toXml();
  assert.match(paymentMinimal, /<PlatnoscInna>1<\/PlatnoscInna>/);

  const noPartial = await FA3Invoice.basic("FV/NPP/1")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine(LINE)
    .payment({ dueDate: "2026-02-01" })
    .toXml();
  assert.doesNotMatch(noPartial, /<ZaplataCzesciowa>/);

  const noFactor = await FA3Invoice.basic("FV/NF/1")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine(LINE)
    .bankAccount({ number: "PL11" })
    .toXml();
  assert.match(noFactor, /<RachunekBankowy>/);
  assert.doesNotMatch(noFactor, /<RachunekBankowyFaktora>/);

  const settlementChargesOnly = await FA3Invoice.settlement("ROZ/C/1")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine(LINE)
    .advanceReference({ invoiceNumber: "ZAL/1" })
    .settlementDetails({
      amountDue: 124,
      charges: [{ amount: 1, reason: "opłata" }],
      deductions: [{ amount: 0, reason: "zero" }],
    })
    .toXml();
  assert.match(settlementChargesOnly, /<SumaObciazen>/);
});

test("builder.ts: line amount overrides and party identifier validation branches", async () => {
  const lineOverrides = await FA3Invoice.basic("FV/LINE/1")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine({
      ...LINE,
      netAmount: 90,
      vatAmount: 10,
      grossAmount: 100,
      vatRate: 0,
    })
    .toXml();
  assert.match(lineOverrides, /<P_11>90.00<\/P_11>/);

  const foreignBuyer = new FA3Draft({
    invoiceNumber: "FV/FB/1",
    issueDate: "2026-01-15",
    seller: SELLER,
    buyer: {
      name: "Foreign",
      taxId: "CH-1",
      countryCode: "CH",
      identifier: { kind: PartyIdentifierKind.FOREIGN, value: "CH-1", countryCode: "CH" },
    },
    lines: [LINE],
  });
  assert.equal(foreignBuyer.toFakturaInput().Podmiot2.DaneIdentyfikacyjne.KodKraju, "CH");

  const jstOk = await FA3Invoice.basic("FV/JSTOK/1")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer({ ...BUYER, isJstSubunit: true })
    .addLine(LINE)
    .addParty({ name: "JST", taxId: "5555555555", role: "jst_subunit" })
    .toXml();
  assert.match(jstOk, /<Podmiot3>/);

  const gvOk = await FA3Invoice.basic("FV/GVOK/1")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer({ ...BUYER, isVatGroupMember: true })
    .addLine(LINE)
    .addParty({ name: "GV", taxId: "6666666666", role: "vat_group_member" })
    .toXml();
  assert.match(gvOk, /<GV>1<\/GV>/);
});

test("builder.ts: fromDict fallbacks and transport/order false branches", async () => {
  const fromDict = FA3Draft.fromDict({
    invoiceNumber: "",
    issue_date: "2026-01-15",
    seller: SELLER,
    buyer: BUYER,
    lines: [LINE],
  });
  assert.equal(fromDict.toDict().invoiceNumber, "");

  const noTransport = await FA3Invoice.basic("FV/NT/1")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine(LINE)
    .toXml();
  assert.doesNotMatch(noTransport, /<Transport>/);

  const orderRefOnly = await FA3Invoice.basic("FV/OR/1")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine(LINE)
    .orderReference("ZAM/1", "2026-01-01")
    .toXml();
  assert.match(orderRefOnly, /<WarunkiTransakcji>/);
});

test("builder.ts: remaining optional false branches and advance reference clearing", async () => {
  const correctionMinimal = await FA3Invoice.correction("KOR/MIN/1")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine(LINE)
    .correction({ reason: "r", correctedInvoiceNumber: "FV/1", correctedInvoiceDate: "2025-12-01" })
    .toXml();
  assert.doesNotMatch(correctionMinimal, /<TypKorekty>/);

  const correctedDateOnly = await FA3Invoice.correction("KOR/D/1")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine(LINE)
    .correction({ reason: "r", correctedInvoiceNumber: "FV/1", correctedInvoiceDate: "2025-12-01" })
    .toXml();
  assert.match(correctedDateOnly, /<DataWystawieniaFa>/);

  const advanceRateOnly = await FA3Invoice.advance("ZAL/R/1")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .foreignCurrencyRate(4.5)
    .toXml();
  assert.match(advanceRateOnly, /<KursWalutyZ>/);

  const otherWithDescription = await FA3Invoice.basic("FV/OD/1")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine(LINE)
    .addParty({ name: "Inna", taxId: "8888888888", role: "other", otherRoleDescription: "Opis" })
    .toXml();
  assert.match(otherWithDescription, /<OpisRoli>Opis<\/OpisRoli>/);

  const clearedKsef = FA3Invoice.settlement("ROZ/K/1")
    .issueDate("2026-01-15")
    .seller(SELLER)
    .buyer(BUYER)
    .addLine(LINE)
    .advanceReference({ ksefNumber: "KSEF-ZAL" })
    .settlesAdvance({ invoiceNumber: "ZAL/1" })
    .settlesAdvance({ ksefNumber: undefined })
    .build();
  assert.equal(clearedKsef.toDict().advanceKsefNumber, undefined);
  assert.equal(clearedKsef.toDict().advanceInvoiceNumber, "ZAL/1");
});
