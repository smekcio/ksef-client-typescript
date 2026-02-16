# Invoices

Thin client dla `/invoices/*`.

## Metody

- `getInvoice(ksefNumber)`
- `queryInvoiceMetadata(filters, pageOffset?, pageSize?, sortOrder?)`
- `exportInvoices(request)`
- `getInvoiceExportStatus(referenceNumber)`

`exportInvoices(request)` obsluguje tez opcjonalne `includeMetadata: true`.
Przy tej opcji SDK ustawia naglowek `X-KSeF-Feature: include-metadata`.

## Walidacja `dateRange` (lokalna, przed HTTP)

SDK waliduje `filters.dateRange` w `queryInvoiceMetadata(...)` i `exportInvoices(...)`:

- wymagane: `subjectType`, `dateRange.dateType`, `dateRange.from`,
- `from` musi byc ISO (`YYYY-MM-DD` albo ISO date-time),
- `to` (jesli ustawione) musi byc ISO i `>= from`,
- gdy `to` nie jest podane, SDK uzywa aktualnej daty/czasu UTC,
- zakres nie moze przekroczyc 3 miesiecy.

Przy naruszeniu tych warunkow rzucany jest `KsefValidationError`.

## Przyklad 1: pobranie XML faktury

```ts
const xml = await client.invoices.getInvoice("KSEF_NUMBER");
console.log(xml.slice(0, 200));
```

## Przyklad 2: query metadata z paginacja i sortowaniem

```ts
const metadata = await client.invoices.queryInvoiceMetadata(
  {
    subjectType: "Subject1",
    dateRange: {
      dateType: "Issue",
      from: "2025-01-01",
      to: "2025-01-31",
    },
  },
  0,
  50,
  "Desc",
);

console.log(metadata);
```

## Przyklad 3: start eksportu i polling statusu

```ts
const init = await client.invoices.exportInvoices({
  includeMetadata: true,
  encryption: {
    encryptedSymmetricKey: "BASE64",
    initializationVector: "BASE64",
  },
  filters: {
    subjectType: "Subject1",
    dateRange: {
      dateType: "PermanentStorage",
      from: "2025-01-01T00:00:00Z",
      to: "2025-01-31T23:59:59Z",
      restrictToPermanentStorageHwmDate: true,
    },
  },
});

for (let attempt = 0; attempt < 60; attempt += 1) {
  const status = await client.invoices.getInvoiceExportStatus(init.referenceNumber);
  if (status.status.code === 200) {
    console.log("Export ready", status.package?.parts?.length ?? 0);
    break;
  }
  if (status.status.code !== 100) {
    throw new Error(`Export failed: ${status.status.code} ${status.status.description}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
```

## Przyklad 4: blad walidacji (`dateRange` > 3 miesiace)

```ts
import { KsefValidationError } from "ksef-client-typescript";

try {
  await client.invoices.queryInvoiceMetadata({
    subjectType: "Subject1",
    dateRange: {
      dateType: "Issue",
      from: "2025-01-01",
      to: "2025-05-01",
    },
  });
} catch (error) {
  if (error instanceof KsefValidationError) {
    console.error(error.message); // Invoice query filters.dateRange cannot exceed 3 months.
    console.error(error.details); // from/to szczegoly
  }
  throw error;
}
```

## Przyklad 5: otwarty zakres (`to` pomijane)

```ts
await client.invoices.queryInvoiceMetadata({
  subjectType: "Subject1",
  dateRange: {
    dateType: "Issue",
    from: "2025-02-01",
    // to: brak -> SDK podstawia aktualny czas UTC
  },
});
```

Przy pelnym scenariuszu eksportu (pobranie partow, deszyfrowanie, unzip) uzyj: [../workflows/export.md](../workflows/export.md).
