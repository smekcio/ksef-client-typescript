# Workflows (services)

Ta strona opisuje workflow classes z warstwy services oraz ich praktyczne uzycie.

## Dostepne klasy

- `AuthCoordinator`
- `OnlineSessionWorkflow`
- `BatchSessionWorkflow`
- `OfflineInvoiceWorkflow`
- `InvoiceExportWorkflow`
- `IncrementalExportWorkflow`

W praktyce najczesciej korzystasz z ich instancji pod `client.workflows.*`.

## 1) `AuthCoordinator`

Flow:
- challenge,
- init auth (token lub XAdES),
- polling statusu,
- redeem tokenow.

Przyklad:

```ts
const tokens = await client.workflows.auth.authenticateWithKsefToken({
  token: process.env.KSEF_TOKEN!,
  context: { type: "Nip", value: "5265877635" },
  pollIntervalMs: 2000,
  maxAttempts: 90,
});

client.authManager.setTokens(tokens);
```

## 2) `OnlineSessionWorkflow`

Flow:
- budowa danych szyfrowania z certyfikatu `SymmetricKeyEncryption`,
- open session,
- encrypt + send invoice,
- close session,
- polling UPO.

Przyklad:

```ts
const online = await client.workflows.sessions.online.open({
  formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
  upoV43: true,
});

await online.sendInvoice({ invoice: "<Faktura>...</Faktura>" });
await online.close();

const upo = await online.waitForUpo({ pollIntervalMs: 2000, maxAttempts: 60 });
console.log(Boolean(upo));
```

## 3) `BatchSessionWorkflow`

Flow:
- ZIP (z `invoices` albo gotowy `zipBytes`),
- split partow (domyslnie 100 MB),
- AES encryption,
- open batch,
- upload partow na pre-signed URL,
- close batch.

Przyklad:

```ts
const batch = await client.workflows.sessions.batch.openUploadAndClose({
  formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
  invoices: [{ fileName: "invoice.xml", invoice: "<Faktura>...</Faktura>" }],
  parallelism: 4,
  maxPartSizeBytes: 25 * 1024 * 1024,
});

const status = await batch.status();
console.log(status.status.code);
```

## 4) `InvoiceExportWorkflow`

Flow:
- `startExport` (z walidacja `dateRange`),
- `waitForExport`,
- `downloadAndProcessPackage` (download, decrypt, unzip, parse metadata).

Przyklad:

```ts
const started = await client.workflows.exports.startExport({
  filters: {
    subjectType: "Subject1",
    dateRange: { dateType: "Issue", from: "2025-01-01", to: "2025-01-31" },
  },
});

const status = await client.workflows.exports.waitForExport(started.referenceNumber);
const processed = await client.workflows.exports.downloadAndProcessPackage(
  status,
  started.encryptionData,
  { verifyHashes: true },
);

console.log(processed.metadataSummaries.length, Object.keys(processed.invoiceXmlFiles).length);
```

## 5) `OfflineInvoiceWorkflow`

Flow:
- open sesji interaktywnej,
- wysylka faktury z `offlineMode=true`,
- close sesji,
- opcjonalny polling UPO,
- instrukcje operacyjne dla trybow offline.

Przyklad:

```ts
const result = await client.workflows.offline.sendOfflineInvoice({
  formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
  invoice: "<Faktura>...</Faktura>",
  waitForUpo: true,
});

const guide = client.workflows.offline.getProcedureInstructions("offline24");
console.log(result.invoiceReferenceNumber, guide.sendDeadline);
```

## 6) `IncrementalExportWorkflow`

Flow:
- iteracyjne uruchamianie eksportu,
- aktualizacja continuation points po kazdej paczce,
- deduplikacja po `ksefNumber`.

Przyklad:

```ts
const continuationPoints: Record<string, string | undefined> = {};

const incremental = await client.workflows.exportsIncremental.run({
  subjectType: "Subject1",
  windowFrom: "2025-01-01",
  windowTo: "2025-01-31",
  continuationPoints,
  maxIterations: 20,
  verifyHashes: false,
});

console.log(incremental.referenceNumbers);
console.log(incremental.continuationPoints);
```

## 7) Obsluga bledow workflow

```ts
import { KsefAuthStatusError, KsefValidationError } from "ksef-client-typescript";

try {
  await client.workflows.auth.authenticateWithXadesSignature({
    signedXml: "<AuthTokenRequest>...signed...</AuthTokenRequest>",
    enforceXadesCompliance: true,
  });
} catch (error) {
  if (error instanceof KsefAuthStatusError) {
    console.error(error.statusCode, error.statusDetails);
  }
  throw error;
}

try {
  await client.workflows.exports.startExport({
    filters: {
      subjectType: "Subject1",
      dateRange: { dateType: "Issue", from: "2025-01-01", to: "2025-05-01" },
    },
  });
} catch (error) {
  if (error instanceof KsefValidationError) {
    console.error(error.message, error.details);
  }
}
```
