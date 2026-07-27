# Identyfikatory zbiorcze (`client.collectiveIdentifiers`)

Obsługa identyfikatorów zbiorczych (IZ) wprowadzonych w KSeF API 2.7.0.

Wymagane uprawnienia zależą od operacji — zwykle jedno z: `InvoiceRead`, `InvoiceWrite`,
`CollectiveIdentifierManage`.

Paginacja list: query `pageSize` oraz nagłówek `x-continuation-token`. Token kontynuacji
jest też zwracany w body odpowiedzi (`continuationToken`).

SDK waliduje format `collectiveIdentifierNumber` oraz `ksefNumber` przed wysłaniem
żądania (`Error` przy niepoprawnym formacie/sumie kontrolnej).

## `generate(request)`

Endpoint: `POST /collective-identifiers` (`201`).

Generuje identyfikator zbiorczy dla listy faktur (numery KSeF) tego samego sprzedawcy.
Limit: do 500 faktur w jednym IZ.

## `query(request, options?)`

Endpoint: `POST /collective-identifiers/query`.

Zwraca listę identyfikatorów zbiorczych powiązanych z kontekstem (filtr dat utworzenia
wymagany w payloadzie).

Opcje: `{ pageSize?, continuationToken? }`.

## `listInvoices(collectiveIdentifierNumber, options?)`

Endpoint: `GET /collective-identifiers/{collectiveIdentifierNumber}/invoices`.

Zwraca listę faktur wchodzących w skład wskazanego IZ.

## `listByKsefNumber(ksefNumber, options?)`

Endpoint: `GET /collective-identifiers/ksef/{ksefNumber}`.

Zwraca listę identyfikatorów zbiorczych powiązanych z podanym numerem KSeF.

## Przykład

```ts
const generated = await client.collectiveIdentifiers.generate({
  invoices: [{ ksefNumber: "5265877635-20250826-0100001AF629-AF" }],
});

const list = await client.collectiveIdentifiers.query({
  dateCreatedFrom: "2026-01-01T00:00:00Z",
  dateCreatedTo: "2026-01-31T23:59:59Z",
});

const invoices = await client.collectiveIdentifiers.listInvoices(
  generated.collectiveIdentifierNumber,
  { pageSize: 50 },
);
```
