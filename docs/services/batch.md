# Batch – przygotowanie i wysyłka paczki (`BatchSessionWorkflow`)

W TypeScript główną usługą batch jest `BatchSessionWorkflow`. Zamiast osobnych publicznych helperów do partów, pełny scenariusz realizuje metoda workflow.

## `BatchSessionWorkflow.openUploadAndClose(options)`

Scenariusz wykonywany przez SDK:
1. budowa `EncryptionData` na podstawie certyfikatu `SymmetricKeyEncryption`
2. przygotowanie ZIP (`invoices` albo gotowe `zipBytes`)
3. podział ZIP na części (`maxPartSizeBytes`, domyślnie `MAX_BATCH_PART_SIZE_BYTES` = 100 MB)
4. szyfrowanie każdej części AES-256-CBC
5. wyliczenie metadanych `batchFile` (`fileHash`, `fileSize`, `fileParts`)
6. `POST /sessions/batch` (open)
7. upload partów po `partUploadRequests` (pre-signed URL, bez Bearer tokena)
8. `POST /sessions/batch/{referenceNumber}/close`

Najważniejsze opcje:
- `formCode`: wymagane
- `invoices` lub `zipBytes`: źródło paczki
- `parallelism`: równoległość uploadu partów
- `offlineMode`: tryb offline, jeśli dotyczy
- `upoV43`: negocjacja nagłówkiem `X-KSeF-Feature`

Przykład:

```ts
const batch = await client.workflows.sessions.batch.openUploadAndClose({
  formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
  invoices: [
    { fileName: "invoice-1.xml", invoice: "<Faktura>...</Faktura>" },
    { fileName: "invoice-2.xml", invoice: "<Faktura>...</Faktura>" },
  ],
  parallelism: 4,
});

const status = await batch.status();
console.log(batch.referenceNumber, status.status.code);
```

## `BatchSessionHandle`

Zwracany przez `openUploadAndClose(...)` uchwyt sesji udostępnia:
- `referenceNumber`
- `encryptionData`
- `status()`
- `waitForUpo(options?)`
- `waitForUpoParsed(options?)`

## Ograniczenia rozmiaru partów

KSeF ogranicza rozmiar części do 100 MB. Zwiększanie `maxPartSizeBytes` ponad ten limit może zakończyć się błędem po stronie API.

Powiązane: [Kryptografia i metadane](crypto.md), [Workflows i scenariusze](workflows.md).
