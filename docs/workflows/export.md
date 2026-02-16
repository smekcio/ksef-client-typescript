# Workflow: eksport paczek

`InvoiceExportWorkflow` realizuje flow:
`start export -> wait status -> download parts -> decrypt -> unzip -> parse metadata/XML`.

Dodatkowo `IncrementalExportWorkflow` obsluguje eksport przyrostowy z continuation points.

## Metody

- `client.workflows.exports.startExport(options)`
- `client.workflows.exports.waitForExport(referenceNumber, options?)`
- `client.workflows.exports.downloadAndProcessPackage(status, encryptionData, options?)`
- `client.workflows.exportsIncremental.run(options)`

## Co warto wiedziec

- `startExport(...)` i `invoices.exportInvoices(...)` korzystaja z tej samej walidacji `dateRange`.
- `to` jest opcjonalne; gdy go brak, SDK bierze aktualny czas UTC.
- Maksymalny zakres `dateRange` to 3 miesiace.
- Part download idzie przez pre-signed URL (bez Bearer tokena).

## Przyklad 1: pelny eksport paczki

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

## Przyklad 2: start export z jawnie podanym `encryptionData`

```ts
import { CryptographyService } from "ksef-client-typescript";

const certs = await client.security.getPublicKeyCertificates();
const symCert = certs.find((c) => c.usage.includes("SymmetricKeyEncryption"));
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

## Przyklad 3: incremental export (continuation points)

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
  maxIterations: 10,
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
console.log(result.continuationPoints.Subject1);
```

## Przyklad 4: obsluga walidacji `dateRange`

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

## Przyklad 5: eksport z otwartym `to`

```ts
await client.workflows.exports.startExport({
  filters: {
    subjectType: "Subject1",
    dateRange: {
      dateType: "Issue",
      from: "2025-01-01",
      // to: brak -> SDK uzyje aktualnego UTC
    },
  },
});
```

## Uwagi operacyjne

- URL-e partow eksportu moga wygasac, pobieraj je bez zbednej zwloki.
- `verifyHashes: true` zwieksza bezpieczenstwo, ale kosztuje dodatkowe hashowanie.
- `metadataSummaries` zawiera rekordy z `_metadata.json`; `invoiceXmlFiles` to mapa `nazwa.xml -> tresc`.
