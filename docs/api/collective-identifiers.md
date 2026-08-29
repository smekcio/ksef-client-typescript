# Identyfikatory zbiorcze (`client.collectiveIdentifiers`)

Obsługa identyfikatorów zbiorczych (IZ) wprowadzonych w KSeF API 2.7.0
i zaktualizowanych w 2.7.1.

IZ grupuje już wystawione faktury tego samego sprzedawcy (co najmniej 2 i do 500 numerów KSeF)
pod jednym numerem płatniczym. Jedna faktura może należeć do maksymalnie 132 identyfikatorów
zbiorczych w ramach kontekstu.

## Uprawnienia

Wymagane jest **jedno z**: `InvoiceRead`, `InvoiceWrite`, `CollectiveIdentifierManage`.
`CollectiveIdentifierManage` wystarcza do operacji na IZ bez uprawnień do wystawiania faktur.

## Limity

| Limit | Wartość |
| --- | --- |
| Faktury w jednym IZ | 2–500 (OpenAPI `minItems` / `maxItems`) |
| IZ na jedną fakturę (w kontekście) | 132 |
| Zakres `dateCreatedFrom`–`dateCreatedTo` | 100 dni |
| `pageSize` query / by-ksef | 10–200 (domyślnie 10) |
| `pageSize` invoices | 10–500 (domyślnie 10) |
| IZ w jednym `listInvoices` | 10 |
| Rate limit grupy `collectiveIdentifier` | 20 / 120 / 240 |

Kody błędów `generate`:

| Kod | Znaczenie |
| --- | --- |
| `71001` | Faktura nie może zostać przypisana do IZ |
| `71002` | Faktura jest już przypisana do maksymalnej liczby IZ |

Stałe i mapowanie kodów: `ksef-client` (`MIN_INVOICES_PER_IDENTIFIER`, `MAX_INVOICES_PER_IDENTIFIER`, `COLLECTIVE_IDENTIFIER_EXCEPTION_CODES`).
Błędy API nadal przychodzą jako `KsefApiError`.
Górny limit 500 w `generate()` to limit schematu OpenAPI; efektywny limit kontekstu na TEST to
`GET /limits/context` → `collectiveIdentifier.maxInvoices` (nadpisywany testdata).

## Scenariusz

1. Wyślij faktury sesją online albo wsadową.
2. Zbierz numery KSeF z UPO lub metadanych.
3. Złóż IZ i użyj numeru na przelewie:

```ts
const generated = await client.collectiveIdentifiers.generateForKsefNumbers([
  "5265877635-20250826-0100001AF629-AF",
  "5265877635-20250827-0100001AF629-4A",
]);
console.log(generated.collectiveIdentifierNumber);

import { makeCollectiveIdentifierInvoice } from "ksef-client";

const invoice = makeCollectiveIdentifierInvoice(
  "5265877635-20250826-0100001AF629-AF",
  { amount: 150, currency: "PLN" },
);
const invoice2 = makeCollectiveIdentifierInvoice(
  "5265877635-20250827-0100001AF629-4A",
  { amount: 80, currency: "PLN" },
);
await client.collectiveIdentifiers.generate({ invoices: [invoice, invoice2] });
```

Paginacja list: query `pageSize` oraz nagłówek `x-continuation-token`. Token kontynuacji
jest też zwracany w body odpowiedzi (`continuationToken`). Helpery `iterQuery`,
`iterInvoices` i `iterByKsefNumber` schodzą po stronach same.

SDK waliduje format `collectiveIdentifierNumber` oraz `ksefNumber` przed wysłaniem
żądania (`Error` przy niepoprawnym formacie/sumie kontrolnej). Dodatkowo fail-fast:
liczba faktur 2–500, unikalne numery KSeF, zakres dat ≤ 100 dni, `pageSize` 10–200
(query / by-ksef) albo 10–500 (`listInvoices`), maksymalnie 10 numerów IZ w `listInvoices`.

CLI: `ksef-ts iz generate|query|invoices|by-ksef`.

## `generate(request)`

Endpoint: `POST /collective-identifiers` (`201`).

Generuje identyfikator zbiorczy dla listy faktur (numery KSeF) tego samego sprzedawcy.
OpenAPI wymaga co najmniej dwóch faktur (`minItems: 2`); górny limit schematu to 500.

## `generateForKsefNumbers(ksefNumbers, options?)`

Składa `GenerateCollectiveIdentifierRequest` z numerów KSeF. Płatności zostaw przy
`generate()` i `makeCollectiveIdentifierInvoice`.

## `query(request, options?)`

Endpoint: `POST /collective-identifiers/query`.

Zwraca listę identyfikatorów zbiorczych powiązanych z kontekstem (filtr dat utworzenia
wymagany w payloadzie, max 100 dni).

Opcje: `{ pageSize?, continuationToken? }`.

## `queryByCreatedRange(dateFrom, dateTo, options?)`

Convenience nad `query`. Daty `YYYY-MM-DD` są rozszerzane do początku/końca dnia UTC.

## `iterQuery(request, options?)`

Iterator po wszystkich stronach `query`.

## `listInvoices(collectiveIdentifierNumbers, options?)`

Endpoint: `POST /collective-identifiers/invoices`.

Zwraca listę faktur wchodzących w skład podanych IZ (1–10 numerów). Pojedynczy
string jest akceptowany tak samo jak lista. Odpowiedź zawiera `collectiveIdentifierNumber`
przy każdej fakturze. `pageSize` ma zakres 10–500.

Od 2.7.1 transport to POST z listą IZ (w 2.7.0 był GET jednego numeru).

## `iterInvoices(collectiveIdentifierNumbers, options?)`

Iterator po stronach `listInvoices`.

## `listByKsefNumber(ksefNumber, options?)`

Endpoint: `GET /collective-identifiers/ksef/{ksefNumber}`.

Zwraca listę identyfikatorów zbiorczych powiązanych z podanym numerem KSeF.

## `iterByKsefNumber(ksefNumber, options?)`

Iterator po stronach `listByKsefNumber`.
