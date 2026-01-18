# Workflow: eksport paczek

Workflow `InvoiceExportWorkflow` inicjuje eksport, czeka na status, pobiera paczki i odszyfrowuje je.

## Przyklad

```ts
const { referenceNumber, encryptionData } = await client.workflows.exports.startExport({
  filters: { subjectType: "Subject1" },
});

const status = await client.workflows.exports.waitForExport(referenceNumber);

const data = await client.workflows.exports.downloadAndProcessPackage(status, encryptionData, {
  verifyHashes: true,
});

console.log(data.metadataSummaries.length);
```

## Eksport przyrostowy

`IncrementalExportWorkflow` pomaga iteracyjnie pobierac paczki w oknie czasowym, aktualizujac continuation point (HWM) na podstawie informacji o paczce.

```ts
const points = {};

const result = await client.workflows.exportsIncremental.run({
  subjectType: "Subject1",
  windowFrom: "2025-01-01",
  windowTo: "2025-01-31",
  continuationPoints: points,
  filtersFactory: (from, to) => ({
    subjectType: "Subject1",
    dateRange: { dateType: "PermanentStorage", from, to },
  }),
});

console.log(result.metadataSummaries.length);
```
