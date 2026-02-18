# Workflow: eksport paczek

Eksport obejmuje:

1. start eksportu (`POST /invoices/exports`),
2. polling statusu eksportu,
3. pobranie partów z pre-signed URL,
4. odszyfrowanie, scalenie i rozpakowanie paczki,
5. odczyt `_metadata.json` i faktur XML.

W SDK odpowiadają za to:

- `InvoiceExportWorkflow` (`client.workflows.exports`)
- `IncrementalExportWorkflow` (`client.workflows.exportsIncremental`)

## Metody `InvoiceExportWorkflow`

- `startExport(options)`
- `waitForExport(referenceNumber, options?)`
- `downloadAndProcessPackage(status, encryptionData, options?)`

## Metoda `IncrementalExportWorkflow`

- `run(options)`

## Full vs incremental

`InvoiceExportWorkflow` (full/manual):

- uruchamiasz pojedynczy eksport dla jednego `filters`,
- samodzielnie kontrolujesz pętlę, retry i granice okna czasowego,
- użyteczne, gdy potrzebujesz jednorazowego pobrania paczki albo pełnej kontroli nad przebiegiem.

`IncrementalExportWorkflow`:

- uruchamia wiele kolejnych eksportów w pętli,
- po każdej paczce aktualizuje `continuationPoints` po `subjectType`,
- deduplikuje metadane po `ksefNumber`/`KsefNumber`,
- kończy, gdy kolejne `effectiveFrom` nie przesuwa się dalej albo osiągnie `maxIterations`.

W praktyce: full to "pojedyncza paczka", incremental to "ciągłe domykanie okna" przy dużych zbiorach i sytuacjach `isTruncated=true`.

## `startExport(options)` - opcje

- `filters` (wymagane)
- `encryptionData` (opcjonalnie)
- `publicCertificateBase64Der` (opcjonalnie; alternatywa do `encryptionData`)

Gdy nie podasz `encryptionData` ani `publicCertificateBase64Der`, workflow sam pobierze certyfikat
`SymmetricKeyEncryption` i zbuduje dane szyfrowania.

## Walidacja `dateRange`

Walidacja uruchamia się lokalnie przed requestem.

- `filters` musi być obiektem.
- `subjectType` musi być niepustym stringiem.
- `dateRange` jest wymaganym obiektem.
- `dateRange.dateType` musi być niepustym stringiem.
- `dateRange.from` musi być poprawnym ISO `YYYY-MM-DD` albo ISO date-time.
- `dateRange.to` może być `undefined`/`null`; jeśli nie podasz, SDK przyjmie bieżący czas UTC.
- jeśli `dateRange.to` jest podane, też musi być poprawnym ISO date/date-time.
- `to` nie może być mniejsze od `from`.
- maksymalny zakres to 3 miesiące (liczone kalendarzowo, z clampem dni miesiąca).

Szczegół praktyczny: dla `YYYY-MM-DD` SDK parsuje datę jako UTC `00:00:00`, więc porównania zakresu są deterministyczne między strefami czasowymi.

## Przykład 1: pełny eksport paczki

```ts
const started = await client.workflows.exports.startExport({
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

const status = await client.workflows.exports.waitForExport(started.referenceNumber, {
  pollIntervalMs: 2000,
  maxAttempts: 120,
});

const processed = await client.workflows.exports.downloadAndProcessPackage(
  status,
  started.encryptionData,
  { verifyHashes: true },
);

console.log(processed.metadataSummaries.length);
console.log(Object.keys(processed.invoiceXmlFiles).length);
```

## Przykład 2: jawne `encryptionData`

```ts
import { CryptographyService } from "ksef-client-typescript";

const certs = await client.security.getPublicKeyCertificates();
const symCert = certs.find((item) => item.usage.includes("SymmetricKeyEncryption"));
if (!symCert) {
  throw new Error("Missing SymmetricKeyEncryption certificate");
}

const encryptionData = CryptographyService.getEncryptionData(symCert.certificate);

const started = await client.workflows.exports.startExport({
  filters: {
    subjectType: "Subject1",
    dateRange: { dateType: "Issue", from: "2025-01-01", to: "2025-01-31" },
  },
  encryptionData,
});

console.log(started.referenceNumber);
```

## Przykład 3: eksport przyrostowy (continuation points)

```ts
const continuationPoints: Record<string, string | undefined> = {
  Subject1: "2025-01-10T12:00:00Z",
};

const result = await client.workflows.exportsIncremental.run({
  subjectType: "Subject1",
  windowFrom: "2025-01-01",
  windowTo: "2025-01-31",
  continuationPoints,
  verifyHashes: true,
  pollIntervalMs: 2000,
  maxAttempts: 120,
  maxIterations: 10,
});

console.log(result.referenceNumbers);
console.log(result.continuationPoints.Subject1);
console.log(result.metadataSummaries.length);
```

Ważne: `continuationPoints` są aktualizowane in-place i zwracane też w `result.continuationPoints`.

## Przykład 4: incremental export z `filtersFactory`

```ts
const result = await client.workflows.exportsIncremental.run({
  subjectType: "Subject1",
  windowFrom: "2025-01-01",
  windowTo: "2025-01-31",
  continuationPoints: {},
  filtersFactory: (from, to) => ({
    subjectType: "Subject1",
    dateRange: {
      dateType: "PermanentStorage",
      from,
      to,
      restrictToPermanentStorageHwmDate: true,
    },
  }),
});

console.log(result.referenceNumbers);
```

`filtersFactory(from, to)` dostaje:

- `from`: efektywny start okna (`continuationPoints[subjectType]` albo `windowFrom`),
- `to`: bieżące `windowTo` przekazane do `run(...)`.

To pozwala dynamicznie budować filtry per iteracja, np. zmieniać `dateType` albo dodatkowe pola filtra bez przepisywania pętli eksportu.

Jeśli `filtersFactory` nie jest podane, workflow używa domyślnego filtra:

- `subjectType` z opcji `run(...)`,
- `dateRange.dateType = "PermanentStorage"`,
- `dateRange.from = effectiveFrom`,
- `dateRange.to = windowTo`.

Wymaganie: obiekt zwrócony z `filtersFactory` musi przejść tę samą walidację co w `startExport(...)` (`validateInvoiceQueryFilters`).

## Przykład 5: obsługa błędu walidacji `dateRange`

```ts
import { KsefValidationError } from "ksef-client-typescript";

try {
  await client.workflows.exports.startExport({
    filters: {
      subjectType: "Subject1",
      dateRange: { dateType: "Issue", from: "2025-01-01", to: "2025-05-15" },
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

## Uwagi operacyjne

- `waitForExport(...)` uznaje `status.code=200` za sukces, `100` za trwające przetwarzanie, a inne statusy przerywają proces błędem.
- Domyślny polling eksportu: `pollIntervalMs=2000`, `maxAttempts=60`.
- Download partów eksportu odbywa się z pre-signed URL (bez Bearer tokena).
- URL-e partów mogą wygasać, dlatego paczkę warto pobrać bez zbędnej zwłoki.
- `verifyHashes: true` zwiększa bezpieczeństwo, ale dokłada koszt hashowania.
- `metadataSummaries` pochodzi z `_metadata.json`, a `invoiceXmlFiles` jest mapą `nazwa.xml -> treść XML`.
- W `exportsIncremental.run(...)` wynikowe `metadataSummaries` są deduplikowane po `ksefNumber`/`KsefNumber`.
