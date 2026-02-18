# Workflowy i scenariusze (`ksef-client-typescript/services`)

Workflowy łączą API KSeF z operacjami lokalnymi (kryptografia, ZIP, parsowanie UPO) w gotowe scenariusze integracyjne.

W `KsefClient` są dostępne pod:
- `client.workflows.auth`
- `client.workflows.sessions.online`
- `client.workflows.sessions.batch`
- `client.workflows.exports`
- `client.workflows.exportsIncremental`
- `client.workflows.offline`

## `AuthCoordinator`

Najczęściej używane metody:
- `authenticateWithKsefToken(options)`
- `authenticateWithXadesSignature(options)`
- `authenticateWithCertificate(options)`

Przykład:

```ts
const tokens = await client.workflows.auth.authenticateWithKsefToken({
  token: process.env.KSEF_TOKEN!,
  context: { type: "Nip", value: "5265877635" },
  pollIntervalMs: 2000,
  maxAttempts: 90,
});

client.authManager.setTokens(tokens);
```

## `OnlineSessionWorkflow` i `OnlineSessionHandle`

Przepływ:
1. `open(...)` -> pobranie certyfikatu `SymmetricKeyEncryption`, budowa `EncryptionData`, otwarcie sesji
2. `sendInvoice(...)` -> szyfrowanie faktury i wysyłka
3. `close()`
4. opcjonalnie `waitForUpo()` / `waitForUpoParsed()`

Przykład:

```ts
const online = await client.workflows.sessions.online.open({
  formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
  upoV43: true,
});

await online.sendInvoice({ invoice: "<Faktura>...</Faktura>" });
await online.close();

const upoXml = await online.waitForUpo({ pollIntervalMs: 2000, maxAttempts: 60 });
console.log(Boolean(upoXml));
```

## `BatchSessionWorkflow` i `BatchSessionHandle`

Przepływ:
1. budowa/pobranie ZIP
2. podział na party (limit 100 MB na część)
3. szyfrowanie AES
4. `openBatchSession`
5. upload partów na pre-signed URL
6. `closeBatchSession`

Przykład:

```ts
const batch = await client.workflows.sessions.batch.openUploadAndClose({
  formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
  invoices: [{ fileName: "invoice.xml", invoice: "<Faktura>...</Faktura>" }],
  parallelism: 4,
});

const status = await batch.status();
console.log(batch.referenceNumber, status.status.code);
```

## `InvoiceExportWorkflow`

Najważniejsze metody:
- `startExport({ filters, ... })`
- `waitForExport(referenceNumber, options?)`
- `downloadAndProcessPackage(status, encryptionData, { verifyHashes? })`

Przykład:

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

Wynik `downloadAndProcessPackage(...)` ma strukturę:

```ts
interface PackageProcessingResult {
  metadataSummaries: Array<Record<string, unknown>>;
  invoiceXmlFiles: Record<string, string>;
}
```

Znaczenie pól:
- `metadataSummaries`: rekordy z `_metadata.json` (SDK obsługuje zarówno `invoices`, jak i `invoiceList`).
- `invoiceXmlFiles`: mapa `nazwa_pliku.xml -> XML` po odszyfrowaniu i rozpakowaniu archiwum.

`verifyHashes` (domyślnie `false`) działa na etapie pobierania partów:
- dla każdego partu liczony jest `sha256Base64(data)` i porównywany z `part.encryptedPartHash`,
- przy niezgodności workflow rzuca błąd i nie przechodzi do odszyfrowania/scalenia.

Kiedy używać `verifyHashes: true`:
- środowiska produkcyjne z wysokim wymaganiem integralności danych,
- transfer przez infrastrukturę, której nie kontrolujesz end-to-end,
- procesy audytowe/compliance, gdzie chcesz jawnie potwierdzić zgodność partów.

Kiedy zostawić `verifyHashes: false`:
- kontrolowane środowiska wewnętrzne i duże wolumeny, gdy kluczowa jest wydajność,
- sytuacje, gdzie dodatkowy koszt hashowania partów jest nieakceptowalny czasowo.

## `IncrementalExportWorkflow`

`run(options)` wykonuje wielokrotne okna eksportu i automatycznie:
- aktualizuje continuation points (`updateContinuationPoint`)
- deduplikuje metadane po `ksefNumber`

Przykład:

```ts
const continuationPoints: Record<string, string | undefined> = {};

const result = await client.workflows.exportsIncremental.run({
  subjectType: "Subject1",
  windowFrom: "2025-01-01",
  windowTo: "2025-01-31",
  continuationPoints,
  maxIterations: 20,
  verifyHashes: false,
});

console.log(result.referenceNumbers);
console.log(result.continuationPoints);
```

## `OfflineInvoiceWorkflow`

Wysyłka faktury offline oparta na sesji interaktywnej:
- `sendOfflineInvoice(options)`
- `sendOfflineTechnicalCorrection(options)`
- `getProcedureInstructions(mode)`
- `listProcedureInstructions()`

Przykład:

```ts
const result = await client.workflows.offline.sendOfflineInvoice({
  formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
  invoice: "<Faktura>...</Faktura>",
  waitForUpo: true,
});

const guide = client.workflows.offline.getProcedureInstructions("offline24");
console.log(result.invoiceReferenceNumber, guide.sendDeadline);
```

Powiązane strony:
- [Auth (XML i proces uwierzytelnienia)](auth.md)
- [Batch (podział, szyfrowanie, upload)](batch.md)
- [Kryptografia i metadane](crypto.md)
- [HWM i deduplikacja](hwm.md)
