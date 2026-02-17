# Faktury (`invoices`)

Niskopoziomowy klient dla endpointów `/invoices/*`.

## Dostępne metody

- `getInvoice(ksefNumber)`
- `queryInvoiceMetadata(filters, pageOffset?, pageSize?, sortOrder?)`
- `exportInvoices(request)`
- `getInvoiceExportStatus(referenceNumber)`

## Najważniejsze informacje

- `getInvoice(...)` zwraca XML faktury jako `string`.
- `exportInvoices(...)` obsługuje opcjonalne `includeMetadata`. Gdy ustawisz `includeMetadata: true`, SDK dodaje nagłówek `X-KSeF-Feature: include-metadata` (potwierdzone testami jednostkowymi).
- `queryInvoiceMetadata(...)` i `exportInvoices(...)` wykonują lokalną walidację `filters` przed wywołaniem HTTP.

## Walidacja `dateRange` (lokalna, przed HTTP)

SDK waliduje `filters.dateRange` według poniższych zasad:

- wymagane są `subjectType`, `dateRange.dateType` i `dateRange.from`,
- `from` musi być poprawną datą ISO (`YYYY-MM-DD` lub ISO date-time),
- `to` (jeżeli podane) musi być poprawną datą ISO i nie może być wcześniejsze niż `from`,
- jeżeli `to` nie jest podane, SDK używa bieżącego czasu UTC,
- zakres `from` -> `to` nie może przekroczyć 3 miesięcy.

W przypadku naruszenia warunków rzucany jest `KsefValidationError`.

## Przykłady TypeScript

### Pobranie XML faktury

```ts
const xml = await client.invoices.getInvoice("KSEF_NUMBER");
console.log(xml.slice(0, 200));
```

### Zapytanie o metadane z paginacją i sortowaniem

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

### Start eksportu i polling statusu

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

let completed = false;
for (let attempt = 0; attempt < 60; attempt += 1) {
  const status = await client.invoices.getInvoiceExportStatus(init.referenceNumber);
  if (status.status.code === 200) {
    console.log("Pakiet gotowy:", status.package?.parts?.length ?? 0);
    completed = true;
    break;
  }
  if (status.status.code !== 100) {
    throw new Error(`Eksport nieudany: ${status.status.code} ${status.status.description}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

if (!completed) {
  throw new Error("Przekroczono czas oczekiwania na zakończenie eksportu.");
}
```

### Obsługa błędu walidacji (`dateRange` > 3 miesiące)

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
    console.error(error.message);
    console.error(error.details);
  }
  throw error;
}
```

### Otwarty zakres dat (`to` pominięte)

```ts
await client.invoices.queryInvoiceMetadata({
  subjectType: "Subject1",
  dateRange: {
    dateType: "Issue",
    from: "2025-02-01",
  },
});
```

Pełny scenariusz eksportu (pobranie części, deszyfrowanie, rozpakowanie) opisuje:
[../workflows/export.md](../workflows/export.md).
