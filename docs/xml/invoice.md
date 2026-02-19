# Faktury XML (`buildFakturaXml`, `serializeInvoiceXml`, `buildPefXml`)

Narzędzia z tej sekcji służą do przygotowania dokumentów XML przekazywanych dalej do workflowów sesji (`online`, `batch`, `offline`).

## API

- `buildFakturaXml(faktura: FakturaInput, options?: FakturaXmlOptions): string`
- `serializeInvoiceXml(input: InvoiceXmlInput, options?: FakturaXmlOptions): Buffer`
- `buildPefXml(input: PefUblDocumentInput, options?: { pretty?: boolean }): string`

## Typy wejściowe

`serializeInvoiceXml(...)` obsługuje:

- `string` (gotowy XML),
- `Buffer` (gotowy XML),
- `XmlDocument` (struktura `preserveOrder` z `parseXml`),
- `XmlObject` (dowolny dokument XML jako obiekt),
- `FakturaInput` (obiekt FA2/FA3),
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

## Przykład 1: obiekt FA -> XML

```ts
import { buildFakturaXml } from "ksef-client-typescript";

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

## Przykład 2: PEF UBL -> XML

```ts
import { buildPefXml } from "ksef-client-typescript";

const pefXml = buildPefXml({
  Invoice: {
    "cbc:CustomizationID": "PL-KSeF-PEF",
    "cbc:ID": "INV/1/2026",
  },
});
```

## Przykład 3: `serializeInvoiceXml(...)`

```ts
import { serializeInvoiceXml } from "ksef-client-typescript";

const fromString = serializeInvoiceXml("<Faktura>...</Faktura>");
const fromObject = serializeInvoiceXml({
  Root: { "@_xmlns": "urn:example", A: "1" },
});
```

## Uwagi operacyjne

- `serializeInvoiceXml(...)` zawsze zwraca `Buffer` UTF-8 i usuwa BOM z początku danych.
- Dla wejścia typu `Buffer` dane są zwracane bez modyfikacji.
- Dla nieobsługiwanego typu wejścia rzucany jest `KsefValidationError("Unsupported invoice input type.")`.
- `buildPefXml(...)` rzuca `KsefValidationError`, gdy jawnie podane `schema` nie zgadza się z rootem (`Invoice`/`CreditNote`).
- `buildFakturaXml(...)` obsługuje tylko FA (`FA2`/`FA3`), nie generuje RR XML.
