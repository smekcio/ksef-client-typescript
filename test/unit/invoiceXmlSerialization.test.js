import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildFakturaXml,
  KsefValidationError,
  parseXml,
  serializeInvoiceXml,
} from "../../dist/index.js";

function minimalFaktura() {
  return {
    KodFormularza: {
      systemCode: "FA (3)",
      schemaVersion: "1-0E",
      value: "FA",
    },
    Naglowek: {
      KodFormularza: {
        systemCode: "FA (3)",
        schemaVersion: "1-0E",
        value: "FA",
      },
      WariantFormularza: "1",
      DataWytworzeniaFa: "2026-03-03T12:00:00Z",
      SystemInfo: "ksef-client-typescript-test",
    },
    Podmiot1: {
      DaneIdentyfikacyjne: {
        NIP: "1111111111",
        Nazwa: "Podatnik Testowy",
      },
      Adres: {
        KodKraju: "PL",
        AdresL1: "Testowa 1",
      },
    },
    Podmiot2: {
      DaneIdentyfikacyjne: {
        NIP: "2222222222",
        Nazwa: "Nabywca Testowy",
      },
      Adres: {
        KodKraju: "PL",
        AdresL1: "Nabywcy 2",
      },
    },
    Fa: {
      KodWaluty: "PLN",
      P_1: "2026-03-03",
      P_2: "FV/1/03/2026",
      P_13_1: "100.00",
      P_14_1: "23.00",
      P_15: "123.00",
    },
  };
}

test("serializeInvoiceXml handles Buffer, string BOM and XmlDocument", () => {
  const sourceBuffer = Buffer.from("<Root>buffer</Root>", "utf8");
  const fromBuffer = serializeInvoiceXml(sourceBuffer);
  assert.equal(fromBuffer.toString("utf8"), "<Root>buffer</Root>");

  const withBom = "\ufeff<Root>string</Root>";
  const fromString = serializeInvoiceXml(withBom);
  assert.equal(fromString.toString("utf8"), "<Root>string</Root>");

  const xmlDoc = parseXml("<Root><A>1</A></Root>");
  const fromDoc = serializeInvoiceXml(xmlDoc);
  assert.match(fromDoc.toString("utf8"), /<Root>/);
  assert.match(fromDoc.toString("utf8"), /<A>1<\/A>/);
});

test("serializeInvoiceXml supports PEF UBL input", () => {
  const xml = serializeInvoiceXml({
    Invoice: {
      "cbc:ID": "INV-PEF-1",
      "cbc:IssueDate": "2026-03-03",
    },
  });

  const text = xml.toString("utf8");
  assert.match(text, /<Invoice/);
  assert.match(text, /cbc:ID>INV-PEF-1/);
});

test("serializeInvoiceXml supports generic XmlObject input", () => {
  const xml = serializeInvoiceXml({
    Root: {
      A: "1",
      Nested: {
        B: "2",
      },
    },
  });
  const text = xml.toString("utf8");
  assert.match(text, /<Root>/);
  assert.match(text, /<Nested>/);
  assert.match(text, /<B>2<\/B>/);
});

test("serializeInvoiceXml passes explicit pretty option for generic XmlObject input", () => {
  const xml = serializeInvoiceXml(
    {
      Root: {
        A: "1",
      },
    },
    { pretty: false },
  );
  assert.match(xml.toString("utf8"), /<Root>/);
});

test("serializeInvoiceXml supports FakturaInput and buildFakturaXml supports custom namespaces", () => {
  const faktura = minimalFaktura();
  const xml = serializeInvoiceXml(faktura, {
    schema: "FA3",
    fakturaNamespace: "urn:test:faktura",
    etdNamespace: "urn:test:etd",
    pretty: true,
  });

  const text = xml.toString("utf8");
  assert.match(text, /xmlns="urn:test:faktura"/);
  assert.match(text, /xmlns:etd="urn:test:etd"/);
  assert.match(text, /kodSystemowy="FA \(3\)"/);
  assert.match(text, /wersjaSchemy="1-0E"/);

  const directXml = buildFakturaXml(minimalFaktura(), { schema: "FA3" });
  assert.match(directXml, /http:\/\/crd\.gov\.pl\/wzor\/2025\/06\/25\/13775\//);

  const defaultSchemaXml = buildFakturaXml(minimalFaktura());
  assert.match(defaultSchemaXml, /http:\/\/crd\.gov\.pl\/wzor\/2025\/06\/25\/13775\//);
});

test("buildFakturaXml orders P_* keys naturally", () => {
  const faktura = minimalFaktura();
  faktura.Fa = {
    P_10: "10",
    P_2: "2",
    P_1: "1",
    P_14_1: "14.1",
    P_14_10: "14.10",
    P_14_2: "14.2",
  };

  const xml = buildFakturaXml(faktura, { schema: "FA3" });

  const p1Index = xml.indexOf("<P_1>");
  const p2Index = xml.indexOf("<P_2>");
  const p10Index = xml.indexOf("<P_10>");
  const p141Index = xml.indexOf("<P_14_1>");
  const p142Index = xml.indexOf("<P_14_2>");
  const p1410Index = xml.indexOf("<P_14_10>");

  assert.ok(p1Index >= 0 && p2Index > p1Index && p10Index > p2Index);
  assert.ok(p141Index >= 0 && p142Index > p141Index && p1410Index > p142Index);
});

test("buildFakturaXml covers comparePKey edge cases and nested array normalization", () => {
  const faktura = minimalFaktura();
  faktura.Naglowek.KodFormularza = "FA";
  faktura.Fa = {
    P_20_10: "20.10",
    P_20_1: "20.1",
    P_20_01: "20.01",
    P_20: "20",
    P_20_B: "20.B",
    P_20_A: "20.A",
    DodatkowyOpis: [[{ Pole: "wartosc" }, "tekst"]],
  };

  const xml = buildFakturaXml(faktura, { schema: "FA3" });
  const p20 = xml.indexOf("<P_20>");
  const p201 = xml.indexOf("<P_20_1>");
  const p2001 = xml.indexOf("<P_20_01>");
  const p2010 = xml.indexOf("<P_20_10>");
  const p20a = xml.indexOf("<P_20_A>");
  const p20b = xml.indexOf("<P_20_B>");

  assert.ok(p20 >= 0 && p201 > p20 && p2001 > p201 && p2010 > p2001);
  assert.ok(p20a > p2010 && p20b > p20a);
  assert.match(xml, /<DodatkowyOpis>/);
  assert.match(xml, /<Pole>wartosc<\/Pole>/);
  assert.match(xml, /<1>tekst<\/1>/);
});

test("buildFakturaXml normalizes object entries inside keyed arrays", () => {
  const faktura = minimalFaktura();
  faktura.Fa = {
    FaWiersz: [
      {
        P_11Vat: "23",
        P_7: "Produkt A",
        P_6A: "szt.",
      },
    ],
  };

  const xml = buildFakturaXml(faktura, { schema: "FA3" });
  const p7Index = xml.indexOf("<P_7>");
  const p11VatIndex = xml.indexOf("<P_11Vat>");

  assert.ok(p7Index >= 0);
  assert.ok(p11VatIndex > p7Index);
});

test("serializeInvoiceXml rejects unsupported input type", () => {
  assert.throws(() => serializeInvoiceXml(123), KsefValidationError);
});
