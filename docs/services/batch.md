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

## Struktura payloadu `openBatchSession` (`batchFile`)

Workflow wysyła do `POST /sessions/batch` payload w uproszczonej postaci:

```ts
{
  formCode,
  encryption: encryptionData.encryptionInfo,
  batchFile: {
    fileSize,      // rozmiar oryginalnego ZIP (przed szyfrowaniem)
    fileHash,      // SHA-256 Base64 z oryginalnego ZIP
    fileParts: [   // metadane zaszyfrowanych partów
      { ordinalNumber, fileSize, fileHash },
      ...
    ],
  },
  offlineMode?,    // tylko jeśli podane
}
```

`batchFile` opisuje paczkę w modelu KSeF:
- `fileSize` i `fileHash` dotyczą całego, nieszyfrowanego ZIP-a.
- `fileParts` opisuje już dane po podziale i szyfrowaniu (każdy part osobno).

## Hashowanie i chunking w praktyce

SDK wykonuje dokładnie tę sekwencję:
1. bierze `zipBytes` (gotowy ZIP albo ZIP zbudowany z `invoices`),
2. dzieli bufor przez `splitBuffer(zipBytes, maxPartSizeBytes)`,
3. szyfruje każdy part (`encryptAes256Cbc`) tym samym `cipherKey` i `cipherIv`,
4. buduje `batchFile`:
   - `fileHash = sha256Base64(zipBytes)`,
   - `fileParts[i].ordinalNumber = i + 1`,
   - `fileParts[i].fileSize = encryptedPart.length`,
   - `fileParts[i].fileHash = sha256Base64(encryptedPart)`.

To ważne operacyjnie: hash per-part liczony jest po szyfrowaniu, więc musi odpowiadać faktycznie uploadowanemu bajt po bajcie payloadowi.

## Upload partów (`partUploadRequests`)

Po `openBatchSession` workflow:
1. sortuje `partUploadRequests` po `ordinalNumber`,
2. waliduje, że liczba requestów = liczba zaszyfrowanych partów,
3. wysyła każdy part pod pre-signed URL z nagłówkami zwróconymi przez API,
4. domyka sesję (`closeBatchSession`).

Uwagi praktyczne:
- upload partów nie używa Bearer tokena (to pre-signed URL),
- `parallelism` steruje liczbą równoległych uploadów,
- puste/null w nagłówkach uploadu są pomijane,
- gdy kolejność lub liczba partów się nie zgadza, workflow przerwie proces błędem walidacji.

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

W praktyce:
- dla dużych paczek i niestabilnej sieci lepiej zmniejszyć `maxPartSizeBytes` (więcej, ale lżejszych partów),
- dla stabilnego łącza i mocnego serwera można podnieść `parallelism`, aby skrócić czas uploadu.

Powiązane: [Kryptografia i metadane](crypto.md), [Workflows i scenariusze](workflows.md).
