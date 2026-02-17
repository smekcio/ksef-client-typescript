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

## `startExport(options)` - opcje

- `filters` (wymagane)
- `encryptionData` (opcjonalnie)
- `publicCertificateBase64Der` (opcjonalnie; alternatywa do `encryptionData`)

Gdy nie podasz `encryptionData` ani `publicCertificateBase64Der`, workflow sam pobierze certyfikat
`SymmetricKeyEncryption` i zbuduje dane szyfrowania.

## Walidacja `dateRange`

Walidacja uruchamia się lokalnie przed requestem.

- `subjectType` musi być niepustym stringiem.
- `dateRange.from` i `dateRange.to` muszą być poprawnym ISO date/date-time.
- `to` może być puste (`undefined`/`null`) - wtedy SDK przyjmuje aktualny czas UTC.
- `to` nie może być mniejsze od `from`.
- zakres nie może przekraczać 3 miesięcy.

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
