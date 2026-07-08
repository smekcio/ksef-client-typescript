import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FA3CorrectionType,
  FA3GTUCode,
  FA3Invoice,
  FA3Party,
  FA3PaymentMethod,
  FA3TaxCategory,
  FA3TransportKind,
  KsefValidationError,
  XmlWellFormedError,
  resolveFa3SchemaPath,
  serializeInvoiceXml,
  validateFa3XmlWellFormed,
} from "../../dist/index.js";

const seller = FA3Party.polishCompany({
  nip: "1111111111",
  name: "Sprzedawca Sp. z o.o.",
  address: { line1: "Prosta 1", line2: "00-001 Warszawa" },
  contacts: [{ email: "sprzedawca@example.test" }],
});

const buyer = FA3Party.polishCompany({
  nip: "2222222222",
  name: "Nabywca S.A.",
  address: "Jasna 2",
});

test("FA3Invoice builder creates complex FA(3) XML", () => {
  const invoice = FA3Invoice.basic("FV/SDK/001/2026")
    .seller(seller)
    .buyer({ ...buyer, buyerId: "BUY-1", jst: false, vatGroup: false })
    .issueDate("2026-05-16")
    .createdAt("2026-05-16T10:11:12Z")
    .issuePlace("Warszawa")
    .saleDate("2026-05-15")
    .warehouseDocument("WZ/1/2026")
    .addServiceLine("Usluga konsultingowa", {
      quantity: "2",
      unitNetPrice: "500",
      tax: FA3TaxCategory.standard23(),
      identifiers: { pkwiu: "62.01.11.0" },
    })
    .addGoodsLine("Towar eksportowy", {
      quantity: "1",
      unitNetPrice: "100",
      tax: FA3TaxCategory.zeroExport(),
      unit: "szt.",
      annex15: true,
    })
    .splitPayment()
    .paymentDue("2026-05-30", FA3PaymentMethod.TRANSFER)
    .bankAccount({ number: "PL00109010140000071219812874", swift: "WBKPPLPP" })
    .cashDiscount("2% przy platnosci do 7 dni", "20")
    .additionalDescription("projekt", "FA3 TypeScript")
    .contract({ number: "UM/1/2026", date: "2026-05-01" })
    .orderReference({ number: "ZAM/1/2026", date: "2026-05-02" })
    .batchNumber("PARTIA-1")
    .transport({
      kind: FA3TransportKind.ROAD,
      carrier: FA3Party.foreignCompany({
        identifier: "DE123456789",
        countryCode: "DE",
        name: "Carrier GmbH",
        address: "Berlin 1",
      }),
      orderNumber: "TR/1",
      shipFrom: "Magazyn A",
      shipTo: { countryCode: "DE", line1: "Berlin 1" },
    })
    .footerInfo("Kapital zakladowy 5000 PLN")
    .registry({ krs: "0000123456" })
    .withRawFa({ DodatkowyOpis: [{ Klucz: "raw", Wartosc: "tak" }] })
    .build();

  const xml = invoice.toXml({ pretty: false });

  assert.match(xml, /<KodFormularza kodSystemowy="FA \(3\)" wersjaSchemy="1-0E">FA<\/KodFormularza>/);
  assert.match(xml, /<P_2>FV\/SDK\/001\/2026<\/P_2>/);
  assert.match(xml, /<P_13_1>1000.00<\/P_13_1>/);
  assert.match(xml, /<P_14_1>230.00<\/P_14_1>/);
  assert.match(xml, /<P_13_6_3>100.00<\/P_13_6_3>/);
  assert.match(xml, /<P_15>1330.00<\/P_15>/);
  assert.match(xml, /<P_18A>1<\/P_18A>/);
  assert.match(xml, /<RachunekBankowy><NrRB>PL00109010140000071219812874<\/NrRB><SWIFT>WBKPPLPP<\/SWIFT><\/RachunekBankowy>/);
  assert.match(xml, /<WarunkiTransakcji>/);
  assert.match(xml, /<Transport>/);
  assert.match(xml, /<Przewoznik>/);
  assert.match(xml, /<Skonto><WarunkiSkonta>2% przy platnosci do 7 dni<\/WarunkiSkonta><WysokoscSkonta>20.00<\/WysokoscSkonta><\/Skonto>/);
  assert.match(xml, /<Stopka>/);
  assert.match(xml, /<Informacje><StopkaFaktury>Kapital zakladowy 5000 PLN<\/StopkaFaktury><\/Informacje>/);
  assert.match(xml, /<Klucz>raw<\/Klucz><Wartosc>tak<\/Wartosc>/);
});

test("FA3Invoice builder supports corrections and settlement invoices", () => {
  const correction = FA3Invoice.correction("KOR/1/2026")
    .seller(seller)
    .buyer(buyer)
    .issueDate("2026-06-01")
    .correctsMany(
      [
        {
          invoiceNumber: "FV/1/2026",
          issueDate: "2026-05-16",
          ksefNumber: "1234567890-20260516-ABCDEF1234-12",
        },
        { invoiceNumber: "FV/2/2026", issueDate: "2026-05-17" },
      ],
      { reason: "Zwrot towaru", correctionType: FA3CorrectionType.OTHER },
    )
    .correctedInvoiceNumberOverride("FV/KORYGOWANA/OVERRIDE")
    .addCorrectedLineBeforeAfter({
      description: "Towar przed korekta",
      quantity: "1",
      unitNetPrice: "100",
      tax: "23",
    }, {
      description: "Towar po korekcie",
      quantity: "1",
      unitNetPrice: "80",
      tax: "23",
      gtu: FA3GTUCode.GTU_12,
    })
    .build();

  const correctionXml = correction.toXml();
  assert.match(correctionXml, /<RodzajFaktury>KOR<\/RodzajFaktury>/);
  assert.match(correctionXml, /<PrzyczynaKorekty>Zwrot towaru<\/PrzyczynaKorekty>/);
  assert.match(correctionXml, /<NrKSeF>1<\/NrKSeF>/);
  assert.match(correctionXml, /<NrFaKorygowany>FV\/KORYGOWANA\/OVERRIDE<\/NrFaKorygowany>/);
  assert.match(correctionXml, /<StanPrzed>1<\/StanPrzed>/);
  assert.match(correctionXml, /<GTU>GTU_12<\/GTU>/);
  assert.match(correctionXml, /<P_15>-24.60<\/P_15>/);

  const settlement = FA3Invoice.settlement("ROZ/1/2026")
    .seller(seller)
    .buyer(buyer)
    .issueDate("2026-06-10")
    .settlesAdvances([{ invoiceNumber: "ZAL/1/2026" }, { ksefNumber: "1234567890-20260601-ZALICZKA1-11" }])
    .addLine({ description: "Rozliczenie uslugi", quantity: "1", unitNetPrice: "1000", tax: "23" })
    .documentDiscount("123", "Zaliczka")
    .remainingToPay("1107")
    .build();

  const settlementXml = settlement.toXml();
  assert.match(settlementXml, /<RodzajFaktury>ROZ<\/RodzajFaktury>/);
  assert.match(settlementXml, /<FakturaZaliczkowa><NrKSeFZN>1<\/NrKSeFZN><NrFaZaliczkowej>ZAL\/1\/2026<\/NrFaZaliczkowej><\/FakturaZaliczkowa>/);
  assert.match(settlementXml, /<NrKSeFFaZaliczkowej>1234567890-20260601-ZALICZKA1-11<\/NrKSeFFaZaliczkowej>/);
  assert.match(settlementXml, /<Rozliczenie>/);
  assert.match(settlementXml, /<DoZaplaty>1107.00<\/DoZaplaty>/);
});

test("FA3Invoice builder supports advance order rows and serializeInvoiceXml", () => {
  const invoice = FA3Invoice.advance("ZAL/1/2026")
    .seller(seller)
    .buyer(buyer)
    .issueDate("2026-07-01")
    .advancePayment({ amount: "615", tax: "23", paidOn: "2026-06-30" })
    .orderLine({ description: "Przyszla dostawa", quantity: "2", unitNetPrice: "250", tax: "23" })
    .build();

  const text = serializeInvoiceXml(invoice).toString("utf8");
  assert.match(text, /<RodzajFaktury>ZAL<\/RodzajFaktury>/);
  assert.match(text, /<ZaliczkaCzesciowa><P_6Z>2026-06-30<\/P_6Z><P_15Z>615.00<\/P_15Z><\/ZaliczkaCzesciowa>/);
  assert.match(text, /<ZamowienieWiersz><NrWierszaZam>1<\/NrWierszaZam>/);
  assert.match(text, /<P_11NettoZ>500.00<\/P_11NettoZ>/);
  assert.doesNotMatch(text, /<FaWiersz>/);
});

test("FA3Invoice builder supports typed transport means and attachments", () => {
  const invoice = FA3Invoice.basic("FV/ATT/1")
    .seller(seller)
    .buyer(buyer)
    .issueDate("2026-08-01")
    .addLine({ description: "Samochod", quantity: "1", unitNetPrice: "300", tax: "23" })
    .newTransportMeans({
      allowedDate: "2026-08-01",
      rowNumber: 1,
      kind: "land",
      mileage: "10",
      serialNumber: "VIN123",
      make: "Demo",
      model: "Model",
      taxRate: "23",
    })
    .attachmentText("Dane dodatkowe", "Pierwszy akapit", "Drugi akapit")
    .attachmentTable({
      header: "Tabela",
      columns: ["Nazwa", "Wartosc"],
      rows: [["A", "1"], ["B", "2"]],
      footer: ["Suma", "3"],
    })
    .build();

  const xml = invoice.toXml();
  assert.match(xml, /<NowySrodekTransportu><P_22A>2026-08-01<\/P_22A><P_NrWierszaNST>1<\/P_NrWierszaNST>/);
  assert.match(xml, /<P_22B>10<\/P_22B>/);
  assert.match(xml, /<P_22B1>VIN123<\/P_22B1>/);
  assert.match(xml, /<Zalacznik><BlokDanych><ZNaglowek>Dane dodatkowe<\/ZNaglowek>/);
  assert.match(xml, /<Tekst><Akapit>Pierwszy akapit<\/Akapit><Akapit>Drugi akapit<\/Akapit><\/Tekst>/);
  assert.match(xml, /<Tabela><TNaglowek><Kol Typ="txt"><NKom>Nazwa<\/NKom><\/Kol><Kol Typ="txt"><NKom>Wartosc<\/NKom><\/Kol><\/TNaglowek>/);
  assert.match(xml, /<Suma><SKom>Suma<\/SKom><SKom>3<\/SKom><\/Suma>/);
});

test("FA3Invoice builder preserves Date inputs as FA(3) dates", () => {
  const invoice = FA3Invoice.basic("FV/DATE/1")
    .seller(seller)
    .buyer(buyer)
    .issueDate(new Date("2026-09-10T12:34:56Z"))
    .saleDate(new Date("2026-09-09T12:34:56Z"))
    .createdAt(new Date("2026-09-10T12:34:56Z"))
    .addLine({ description: "Data", quantity: "1", unitNetPrice: "10", tax: "23" })
    .build();

  const xml = invoice.toXml();
  assert.match(xml, /<P_1>2026-09-10<\/P_1>/);
  assert.match(xml, /<P_6>2026-09-09<\/P_6>/);
  assert.match(xml, /<DataWytworzeniaFa>2026-09-10T12:34:56Z<\/DataWytworzeniaFa>/);
});

test("FA3Invoice builder allows XSD raw sections without overriding managed root sections", () => {
  const invoice = FA3Invoice.basic("FV/RAW/1")
    .seller({ ...seller, raw: { NrEORI: "PL123456789000000" } })
    .buyer(buyer)
    .issueDate("2026-10-01")
    .addLine({
      description: "Raw",
      quantity: "1",
      unitNetPrice: "100",
      tax: "23",
      raw: { UU_ID: "RAW-LINE-1" },
    })
    .withRawFa({
      DodatkowyOpis: [{ Klucz: "xsd", Wartosc: "sekcja surowa" }],
      Platnosc: {
        Zaplacono: "1",
        DataZaplaty: "2026-10-02",
      },
    })
    .withRawRoot({
      Fa: { P_2: "OVERRIDDEN" },
      Podmiot1: { DaneIdentyfikacyjne: { NIP: "0000000000", Nazwa: "Override" } },
      Zalacznik: { BlokDanych: { ZNaglowek: "Ignored" } },
    })
    .build();

  const xml = invoice.toXml();

  assert.match(xml, /<P_2>FV\/RAW\/1<\/P_2>/);
  assert.doesNotMatch(xml, /OVERRIDDEN/);
  assert.doesNotMatch(xml, /0000000000/);
  assert.doesNotMatch(xml, /Ignored/);
  assert.match(xml, /<NrEORI>PL123456789000000<\/NrEORI>/);
  assert.match(xml, /<UU_ID>RAW-LINE-1<\/UU_ID>/);
  assert.match(xml, /<Klucz>xsd<\/Klucz><Wartosc>sekcja surowa<\/Wartosc>/);
  assert.match(xml, /<Platnosc><Zaplacono>1<\/Zaplacono><DataZaplaty>2026-10-02<\/DataZaplaty><\/Platnosc>/);
});

test("FA3Invoice builder supports margin procedure without P_12", () => {
  const invoice = FA3Invoice.basic("FV/MARZA/1")
    .seller(seller)
    .buyer(buyer)
    .issueDate("2026-12-01")
    .addLine({ description: "Towar uzywany", quantity: "1", unitNetPrice: "100", tax: FA3TaxCategory.margin() })
    .margin("used_goods")
    .build();

  const xml = invoice.toXml();
  assert.doesNotMatch(xml, /<P_12>/);
  assert.match(xml, /<PMarzy><P_PMarzy>1<\/P_PMarzy><P_PMarzy_3_1>1<\/P_PMarzy_3_1><\/PMarzy>/);
});

test("FA3Invoice builder supports simplified, advance correction and settlement correction invoices", () => {
  const simplified = FA3Invoice.simplified("UPR/1/2026")
    .seller(seller)
    .buyer(buyer)
    .issueDate("2026-01-01")
    .addLine({ description: "Usluga", quantity: "1", unitNetPrice: "100", tax: "23" })
    .asSimplifiedReceiptLike()
    .build();
  assert.match(simplified.toXml(), /<RodzajFaktury>UPR<\/RodzajFaktury>/);

  const advanceCorrection = FA3Invoice.advanceCorrection("KORZAL/1/2026")
    .seller(seller)
    .buyer(buyer)
    .issueDate("2026-06-15")
    .correctsInvoice({
      invoiceNumber: "ZAL/1/2026",
      issueDate: "2026-06-01",
      reason: "Korekta zaliczki",
    })
    .correctedAdvanceState("500")
    .addLine({ description: "Po korekcie", quantity: "1", unitNetPrice: "400", tax: "23" })
    .build();
  const advanceCorrectionXml = advanceCorrection.toXml();
  assert.match(advanceCorrectionXml, /<RodzajFaktury>KOR_ZAL<\/RodzajFaktury>/);
  assert.match(advanceCorrectionXml, /<P_15ZK>500.00<\/P_15ZK>/);

  const settlementCorrection = FA3Invoice.settlementCorrection("KORROZ/1/2026")
    .seller(seller)
    .buyer(buyer)
    .issueDate("2026-06-20")
    .correctsInvoice({
      invoiceNumber: "ROZ/1/2026",
      issueDate: "2026-06-10",
      reason: "Korekta rozliczenia",
    })
    .settlesAdvance({ invoiceNumber: "ZAL/1/2026" })
    .addLine({ description: "Po korekcie rozliczenia", quantity: "1", unitNetPrice: "900", tax: "23" })
    .build();
  assert.match(settlementCorrection.toXml(), /<RodzajFaktury>KOR_ROZ<\/RodzajFaktury>/);
});

test("FA3Invoice builder supports settlement charges and corrected additional parties", () => {
  const thirdParty = FA3Party.internalEntity({
    id: "INT-1",
    name: "Podmiot dodatkowy",
    address: "Dodatkowa 1",
  });

  const invoice = FA3Invoice.settlement("ROZ/CHARGE/1")
    .seller(seller)
    .buyer(buyer)
    .issueDate("2026-07-05")
    .settlesAdvance({ invoiceNumber: "ZAL/1/2026" })
    .addLine({ description: "Rozliczenie", quantity: "1", unitNetPrice: "1000", tax: "23" })
    .documentCharge("50", "Transport")
    .documentDiscount("100", "Rabat")
    .remainingToPay("1057")
    .build();

  const settlementXml = invoice.toXml();
  assert.match(settlementXml, /<Obciazenia><Kwota>50.00<\/Kwota><Powod>Transport<\/Powod><\/Obciazenia>/);
  assert.match(settlementXml, /<SumaObciazen>50.00<\/SumaObciazen>/);

  const correction = FA3Invoice.correction("KOR/P3/1")
    .seller(seller)
    .buyer(buyer)
    .issueDate("2026-07-06")
    .additionalParty(thirdParty)
    .correctsInvoice({
      invoiceNumber: "FV/1/2026",
      issueDate: "2026-07-01",
      reason: "Korekta podmiotu dodatkowego",
    })
    .correctedAdditionalParty(thirdParty)
    .addLine({ description: "Korekta", quantity: "1", unitNetPrice: "10", tax: "23" })
    .build();

  const correctionXml = correction.toXml();
  assert.match(correctionXml, /<Podmiot3>/);
  assert.match(correctionXml, /<Podmiot2K>/);
  assert.match(correctionXml, /<IDWew>INT-1<\/IDWew>/);
});

test("FA3Invoice toXmlWellFormed returns well-formed XML", async () => {
  const invoice = FA3Invoice.basic("FV/XSD/2")
    .seller(seller)
    .buyer(buyer)
    .issueDate("2026-11-01")
    .addLine({ description: "XSD", quantity: "1", unitNetPrice: "10", tax: "23" })
    .build();

  const xml = await invoice.toXmlWellFormed();
  assert.match(xml, /<Faktura/);
});

test("validateFa3XmlWellFormed rejects malformed XML", async () => {
  await assert.rejects(
    () => validateFa3XmlWellFormed("<Faktura><unclosed>"),
    (error) => {
      assert.ok(error instanceof XmlWellFormedError);
      assert.ok(error.validationErrors.length > 0);
      return true;
    },
  );
});

test("resolveFa3SchemaPath locates bundled FA(3) reference schema", () => {
  assert.doesNotThrow(() => resolveFa3SchemaPath());
  assert.match(resolveFa3SchemaPath(), /schemat_FA\(3\)_v1-0E\.xsd$/);
});

test("deprecated toXmlValidated delegates to toXmlWellFormed", async () => {
  const invoice = FA3Invoice.basic("FV/XSD/1")
    .seller(seller)
    .buyer(buyer)
    .issueDate("2026-11-01")
    .addLine({ description: "XSD", quantity: "1", unitNetPrice: "10", tax: "23" })
    .build();

  await assert.doesNotReject(invoice.toXmlValidated());
});

test("FA3Invoice builder validates required fields", () => {
  assert.throws(
    () => FA3Invoice.basic("").seller(seller).buyer(buyer).build(),
    KsefValidationError,
  );
  assert.throws(
    () =>
      FA3Invoice.correction("KOR/INVALID")
        .seller(seller)
        .buyer(buyer)
        .addLine({ description: "x", quantity: "1", unitNetPrice: "1" })
        .build(),
    KsefValidationError,
  );
  assert.throws(
    () =>
      FA3Invoice.simplified("UPR/LIMIT")
        .seller(seller)
        .buyer(buyer)
        .issueDate("2026-01-01")
        .addLine({ description: "Limit", quantity: "1", unitNetPrice: "451", tax: "0" })
        .asSimplifiedReceiptLike()
        .build(),
    KsefValidationError,
  );
});
