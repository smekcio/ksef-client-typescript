# Faktury (`invoices`)

Niskopoziomowy klient dla endpointów `/invoices/*`.

## Dostępne metody

- `getInvoice(ksefNumber)`
- `queryInvoiceMetadata(filters, pageOffset?, pageSize?, sortOrder?)`
- `exportInvoices(request)`
- `getInvoiceExportStatus(referenceNumber)`

## Najważniejsze informacje

- `getInvoice(...)` zwraca XML faktury jako `string`.
- `exportInvoices(...)` obsługuje opcjonalne `onlyMetadata`. Gdy ustawisz `onlyMetadata: true`, eksport zwróci wyłącznie `_metadata.json` bez XML faktur.
- Legacy alias `includeMetadata` jest nadal mapowany przez SDK do `onlyMetadata`, ale nowy kod powinien używać już tylko `onlyMetadata`.
- `queryInvoiceMetadata(...)` i `exportInvoices(...)` wykonują lokalną walidację `filters` przed wywołaniem HTTP.
- `exportInvoices(...)` przyjmuje opcjonalne `compressionType` (`Zip` albo `TarGz`).
- `getInvoiceExportStatus(...)` zwraca `package.compressionType`; workflow eksportu rozpakowuje paczkę według tego pola.
- Ten klient nie ma osobnej metody pobrania partów eksportu. Dane potrzebne do pobrania (`package.parts[]`, w tym `url` i `method`) pochodzą z `getInvoiceExportStatus(referenceNumber)`.

## Walidacja `dateRange` (lokalna, przed HTTP)

SDK waliduje `filters.dateRange` według poniższych zasad:

- wymagane są `subjectType`, `dateRange.dateType` i `dateRange.from`,
- `from` musi być poprawną datą ISO (`YYYY-MM-DD` lub ISO date-time),
- `to` (jeżeli podane) musi być poprawną datą ISO i nie może być wcześniejsze niż `from`,
- jeżeli `to` nie jest podane, SDK używa bieżącego czasu UTC,
- jeśli `from`/`to` jest ISO date-time bez offsetu (`YYYY-MM-DDTHH:MM[:SS]`), SDK normalizuje je
  do `Europe/Warsaw` i wysyła z jawnie dodanym offsetem (`+01:00`/`+02:00`),
- zakres `from` -> `to` nie może przekroczyć **100 dni w strefie UTC**.

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
  onlyMetadata: true,
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

### Obsługa błędu walidacji (`dateRange` > 100 dni UTC)

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

Przy `onlyMetadata: true` paczka eksportu zawiera tylko `_metadata.json`.

## Pobieranie partów eksportu

Po uzyskaniu statusu zakończonego eksportu (`status.code = 200`) części paczki pobiera się po URL-ach zwróconych
w `status.package.parts[]` (pre-signed URL, bez dodatkowego endpointu w `client.invoices`).

Jeżeli chcesz użyć gotowego scenariusza zamiast ręcznej obsługi URL-i, skorzystaj z workflow:

- [../workflows/export.md](../workflows/export.md) (`client.workflows.exports.*`, `client.workflows.exportsIncremental.run(...)`)
- [../services/workflows.md](../services/workflows.md) (opis usług workflow dostępnych w `client.workflows`)
