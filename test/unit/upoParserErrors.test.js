import assert from "node:assert/strict";
import { test } from "node:test";
import { parseUpoXml } from "../../dist/index.js";

function buildValidUpo({
  idKontekstu = "<Nip>1111111111</Nip>",
  proof = "<NumerReferencyjnyTokenaKSeF>TOKEN-REF</NumerReferencyjnyTokenaKSeF>",
  opisPotwierdzenia = "",
  dokument = `
    <Dokument>
      <NipSprzedawcy>1111111111</NipSprzedawcy>
      <NumerKSeFDokumentu>KSEF-1</NumerKSeFDokumentu>
      <NumerFaktury>FV/1</NumerFaktury>
      <DataWystawieniaFaktury>2026-01-01</DataWystawieniaFaktury>
      <DataPrzeslaniaDokumentu>2026-01-01T00:00:00Z</DataPrzeslaniaDokumentu>
      <DataNadaniaNumeruKSeF>2026-01-01T00:01:00Z</DataNadaniaNumeruKSeF>
      <SkrotDokumentu>HASH</SkrotDokumentu>
      <TrybWysylki>Online</TrybWysylki>
    </Dokument>
  `,
} = {}) {
  return `<?xml version="1.0" encoding="utf-8"?>
<Potwierdzenie>
  <NazwaPodmiotuPrzyjmujacego>KSeF</NazwaPodmiotuPrzyjmujacego>
  <NumerReferencyjnySesji>SESSION-REF</NumerReferencyjnySesji>
  <Uwierzytelnienie>
    <IdKontekstu>${idKontekstu}</IdKontekstu>
    ${proof}
  </Uwierzytelnienie>
  ${opisPotwierdzenia}
  <NazwaStrukturyLogicznej>Faktura</NazwaStrukturyLogicznej>
  <KodFormularza>FA (3)</KodFormularza>
  ${dokument}
</Potwierdzenie>`;
}

test("parseUpoXml supports non-NIP context identifiers and alternate proof", () => {
  const byInternalId = parseUpoXml(
    buildValidUpo({
      idKontekstu: "<IdWewnetrzny>INTERNAL-1</IdWewnetrzny>",
    }),
  );
  assert.equal(byInternalId.uwierzytelnienie.idKontekstu.kind, "IdWewnetrzny");

  const byVatUe = parseUpoXml(
    buildValidUpo({
      idKontekstu: "<IdZlozonyVatUE>VAT-UE-1</IdZlozonyVatUE>",
    }),
  );
  assert.equal(byVatUe.uwierzytelnienie.idKontekstu.kind, "IdZlozonyVatUE");

  const byPeppol = parseUpoXml(
    buildValidUpo({
      idKontekstu: "<IdDostawcyUslugPeppol>PEPPOL-1</IdDostawcyUslugPeppol>",
      proof: "<SkrotDokumentuUwierzytelniajacego>DOC-HASH</SkrotDokumentuUwierzytelniajacego>",
    }),
  );
  assert.equal(byPeppol.uwierzytelnienie.idKontekstu.kind, "IdDostawcyUslugPeppol");
  assert.equal(byPeppol.uwierzytelnienie.proof.kind, "SkrotDokumentuUwierzytelniajacego");
});

test("parseUpoXml parses numeric OpisPotwierdzenia values", () => {
  const parsed = parseUpoXml(
    buildValidUpo({
      opisPotwierdzenia: `
        <OpisPotwierdzenia>
          <Strona>2</Strona>
          <LiczbaStron>5</LiczbaStron>
          <ZakresDokumentowOd>11</ZakresDokumentowOd>
          <ZakresDokumentowDo>20</ZakresDokumentowDo>
          <CalkowitaLiczbaDokumentow>99</CalkowitaLiczbaDokumentow>
        </OpisPotwierdzenia>
      `,
    }),
  );

  assert.equal(parsed.opisPotwierdzenia?.strona, 2);
  assert.equal(parsed.opisPotwierdzenia?.liczbaStron, 5);
  assert.equal(parsed.opisPotwierdzenia?.calkowitaLiczbaDokumentow, 99);
});

test("parseUpoXml accepts Buffer input without external fixtures", () => {
  const xmlBuffer = Buffer.from(buildValidUpo(), "utf8");
  const parsed = parseUpoXml(xmlBuffer);
  assert.equal(parsed.kodFormularza, "FA (3)");
});

test("parseUpoXml supports multiple Dokument entries from inline XML", () => {
  const parsed = parseUpoXml(
    buildValidUpo({
      dokument: `
        <Dokument>
          <NipSprzedawcy>1111111111</NipSprzedawcy>
          <NumerKSeFDokumentu>KSEF-1</NumerKSeFDokumentu>
          <NumerFaktury>FV/1</NumerFaktury>
          <DataWystawieniaFaktury>2026-01-01</DataWystawieniaFaktury>
          <DataPrzeslaniaDokumentu>2026-01-01T00:00:00Z</DataPrzeslaniaDokumentu>
          <DataNadaniaNumeruKSeF>2026-01-01T00:01:00Z</DataNadaniaNumeruKSeF>
          <SkrotDokumentu>HASH-1</SkrotDokumentu>
          <TrybWysylki>Online</TrybWysylki>
        </Dokument>
        <Dokument>
          <NipSprzedawcy>2222222222</NipSprzedawcy>
          <NumerKSeFDokumentu>KSEF-2</NumerKSeFDokumentu>
          <NumerFaktury>FV/2</NumerFaktury>
          <DataWystawieniaFaktury>2026-01-02</DataWystawieniaFaktury>
          <DataPrzeslaniaDokumentu>2026-01-02T00:00:00Z</DataPrzeslaniaDokumentu>
          <DataNadaniaNumeruKSeF>2026-01-02T00:01:00Z</DataNadaniaNumeruKSeF>
          <SkrotDokumentu>HASH-2</SkrotDokumentu>
          <TrybWysylki>Offline</TrybWysylki>
        </Dokument>
      `,
    }),
  );

  assert.equal(parsed.dokumenty.length, 2);
  assert.equal(parsed.dokumenty[1]?.numerKSeFDokumentu, "KSEF-2");
});

test("parseUpoXml returns validation errors for malformed structures", () => {
  assert.throws(
    () => parseUpoXml("<Potwierdzenie>text</Potwierdzenie>"),
    /Expected object at Potwierdzenie/,
  );

  assert.throws(
    () =>
      parseUpoXml(
        buildValidUpo({
          idKontekstu: "<Unknown>1</Unknown>",
        }),
      ),
    /Unsupported UPO IdKontekstu/,
  );

  assert.throws(
    () =>
      parseUpoXml(
        buildValidUpo({
          proof: "<UnknownProof>1</UnknownProof>",
        }),
      ),
    /Unsupported UPO authentication proof/,
  );

  assert.throws(
    () =>
      parseUpoXml(
        buildValidUpo({
          dokument: "",
        }),
      ),
    /Expected at least one Dokument in UPO/,
  );

  assert.throws(
    () =>
      parseUpoXml(
        buildValidUpo({
          opisPotwierdzenia: `
            <OpisPotwierdzenia>
              <Strona>abc</Strona>
              <LiczbaStron>1</LiczbaStron>
              <ZakresDokumentowOd>1</ZakresDokumentowOd>
              <ZakresDokumentowDo>1</ZakresDokumentowDo>
              <CalkowitaLiczbaDokumentow>1</CalkowitaLiczbaDokumentow>
            </OpisPotwierdzenia>
          `,
        }),
      ),
    /Expected integer at OpisPotwierdzenia.Strona/,
  );

  assert.throws(
    () =>
      parseUpoXml(
        buildValidUpo({
          dokument: `
            <Dokument>
              <NipSprzedawcy></NipSprzedawcy>
              <NumerKSeFDokumentu>KSEF-1</NumerKSeFDokumentu>
              <NumerFaktury>FV/1</NumerFaktury>
              <DataWystawieniaFaktury>2026-01-01</DataWystawieniaFaktury>
              <DataPrzeslaniaDokumentu>2026-01-01T00:00:00Z</DataPrzeslaniaDokumentu>
              <DataNadaniaNumeruKSeF>2026-01-01T00:01:00Z</DataNadaniaNumeruKSeF>
              <SkrotDokumentu>HASH</SkrotDokumentu>
              <TrybWysylki>Online</TrybWysylki>
            </Dokument>
          `,
        }),
      ),
    /Expected non-empty string at Dokument.NipSprzedawcy/,
  );
});
