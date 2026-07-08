# Faktury XML (`FA3Invoice`, `buildFakturaXml`, `serializeInvoiceXml`, `buildPefXml`)

Narzędzia z tej sekcji służą do przygotowania dokumentów XML przekazywanych dalej do workflowów sesji (`online`, `batch`, `offline`).

## API

- `buildFakturaXml(faktura: FakturaInput, options?: FakturaXmlOptions): string`
- `FA3Invoice.basic(number)` / `correction(number)` / `advance(number)` / `settlement(number)`
- `validateFa3XmlWellFormed(xml, options?): void` — sprawdza poprawność składniową XML (well-formedness)
- `serializeInvoiceXml(input: InvoiceXmlInput, options?: FakturaXmlOptions): Buffer`
- `buildPefXml(input: PefUblDocumentInput, options?: { pretty?: boolean }): string`

## Typy wejściowe

`serializeInvoiceXml(...)` obsługuje:

- `string` (gotowy XML),
- `Buffer` (gotowy XML),
- `XmlDocument` (struktura `preserveOrder` z `parseXml`),
- `XmlObject` (dowolny dokument XML jako obiekt),
- `FakturaInput` (obiekt FA2/FA3),
- obiekt buildera FA(3) z `toFakturaInput()` (`FA3Invoice`),
- `PefUblDocumentInput` (`{ Invoice: ... }` albo `{ CreditNote: ... }`).

Dokumenty RR nie mają dedykowanego buildera w SDK. Dla RR użyj gotowego XML (`string`/`Buffer`) i przekaż go dalej do sesji/workflow.

## `buildFakturaXml`: opcje

```ts
interface FakturaXmlOptions {
  schema?: "FA2" | "FA3";
  fakturaNamespace?: string;
  etdNamespace?: string;
  pretty?: boolean;
}
```

Zachowanie:

- domyślny schemat: `FA3`,
- automatyczne przestrzenie nazw zależne od schematu (`FA2`/`FA3`),
- normalizacja `KodFormularza` z formatu obiektowego do XML (`@_kodSystemowy`, `@_wersjaSchemy`, `#text`),
- deterministyczne porządkowanie pól (w tym kluczy `P_*`) i pomijanie wartości `undefined`.

## Przykład 1: typed builder FA(3)

```ts
import { FA3Invoice, FA3Party, FA3TaxCategory } from "ksef-client";

const seller = FA3Party.polishCompany({
  nip: "1111111111",
  name: "Sprzedawca Sp. z o.o.",
  address: { line1: "ul. Test 1", line2: "00-001 Warszawa" },
});

const buyer = FA3Party.polishCompany({
  nip: "2222222222",
  name: "Nabywca S.A.",
  address: "ul. Test 2",
});

const invoice = FA3Invoice.basic("FV/001/2026")
  .seller(seller)
  .buyer(buyer)
  .issueDate("2026-01-07")
  .issuePlace("Warszawa")
  .addServiceLine("Usluga konsultingowa", {
    quantity: "2",
    unitNetPrice: "500",
    tax: FA3TaxCategory.standard23(),
  })
  .splitPayment()
  .paymentDue("2026-01-21")
  .bankAccount({ number: "PL00109010140000071219812874" })
  .build();

const xml = invoice.toXml();
```

Builder automatycznie wylicza podsumowania VAT (`P_13_*`, `P_14_*`, `P_15`) i generuje m.in.
`Adnotacje`, `FaWiersz`, płatności, korekty, zaliczki, rozliczenia, zamówienia, transport,
nowe środki transportu, stopkę i załączniki tekstowe/tabelaryczne. Dla sekcji niewspieranych metodami
wygodnymi można użyć typowanych nazwami XSD rozszerzeń `withRawFa(...)`, `withRawRoot(...)`,
`transactionTerms({ raw: ... })` albo `attachment({ raw: ... })`. `withRawRoot(...)` nie podmienia
sekcji zarządzanych przez builder (`Naglowek`, `Podmiot1`, `Podmiot2`, `Fa`, `Stopka`, `Zalacznik`).

Walidacja poprawności składniowej XML FA(3) jest dostępna przez `invoice.toXmlWellFormed()`,
`invoice.toBufferWellFormed()` albo `validateFa3XmlWellFormed(xml)`. Sprawdza wyłącznie
well-formedness przy użyciu `fast-xml-parser` — **nie** weryfikuje zgodności ze schematem XSD.
Pliki `.xsd` w paczce służą jako referencja; `resolveFa3SchemaPath()` lokalizuje je w `src/xml/fa3-schemas/`.

Najważniejsze różnice względem buildera Python:

- brak draftowego `FA3BatchDraft` z JSON round-trip; paczki ZIP można nadal budować przez istniejący batch workflow,
- walidacja biznesowa w TS jest lżejsza i skupiona na wymaganych polach oraz typach faktur,
- `documentDiscount(amount, reason)` / `documentCharge(amount, reason)` — rozliczenie na fakturze rozliczeniowej,
- `correctedAdditionalParty(party)` — korekta danych podmiotu z `Podmiot3` (mapowane do `Podmiot2K` zgodnie ze schematem FA(3)),

## Przykład 2: obiekt FA -> XML

```ts
import { buildFakturaXml } from "ksef-client";

const xml = buildFakturaXml(
  {
    Naglowek: {
      KodFormularza: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
      WariantFormularza: "3",
      DataWytworzeniaFa: "2026-01-07T00:00:00Z",
      SystemInfo: "Demo",
    },
    Podmiot1: {
      DaneIdentyfikacyjne: { NIP: "1111111111", Nazwa: "Sprzedawca" },
      Adres: { KodKraju: "PL", AdresL1: "ul. Test 1", AdresL2: "00-001 Warszawa" },
    },
    Podmiot2: {
      DaneIdentyfikacyjne: { NIP: "2222222222", Nazwa: "Nabywca" },
      Adres: { KodKraju: "PL", AdresL1: "ul. Test 2", AdresL2: "00-002 Warszawa" },
    },
    Fa: {
      KodWaluty: "PLN",
      P_1: "2026-01-07",
      P_2: "FV/1/2026",
      P_13_1: "100.00",
      P_14_1: "23.00",
      P_15: "123.00",
      RodzajFaktury: "VAT",
      FaWiersz: {
        NrWierszaFa: "1",
        P_7: "Usługa",
        P_8A: "szt.",
        P_8B: "1",
        P_9A: "100.00",
        P_11: "100.00",
        P_12: "23",
      },
    },
  },
  { schema: "FA3" },
);
```

## Przykład 3: PEF UBL -> XML

```ts
import { buildPefXml } from "ksef-client";

const pefXml = buildPefXml({
  Invoice: {
    "cbc:CustomizationID": "PL-KSeF-PEF",
    "cbc:ID": "INV/1/2026",
  },
});
```

## Przykład 4: `serializeInvoiceXml(...)`

```ts
import { FA3Invoice, FA3Party, serializeInvoiceXml } from "ksef-client";

const seller = FA3Party.polishCompany({
  nip: "1111111111",
  name: "Sprzedawca Sp. z o.o.",
  address: "ul. Test 1",
});

const buyer = FA3Party.polishCompany({
  nip: "2222222222",
  name: "Nabywca S.A.",
  address: "ul. Test 2",
});

const fromString = serializeInvoiceXml("<Faktura>...</Faktura>");
const fromObject = serializeInvoiceXml({
  Root: { "@_xmlns": "urn:example", A: "1" },
});
const fromBuilder = serializeInvoiceXml(
  FA3Invoice.basic("FV/1")
    .seller(seller)
    .buyer(buyer)
    .addServiceLine("Usluga", { quantity: "1", unitNetPrice: "100" })
    .build(),
);
```

## Uwagi operacyjne

- `serializeInvoiceXml(...)` zawsze zwraca `Buffer` UTF-8 i usuwa BOM z początku danych.
- Dla wejścia typu `Buffer` dane są zwracane bez modyfikacji.
- Dla nieobsługiwanego typu wejścia rzucany jest `KsefValidationError("Unsupported invoice input type.")`.
- `buildPefXml(...)` rzuca `KsefValidationError`, gdy jawnie podane `schema` nie zgadza się z rootem (`Invoice`/`CreditNote`).
- `buildFakturaXml(...)` obsługuje tylko FA (`FA2`/`FA3`), nie generuje RR XML.
