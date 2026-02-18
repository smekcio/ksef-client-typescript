# UPO i polling (`WaitForUpoOptions`, `waitForUpo*`)

`src/services/upo.ts` eksportuje jeden wspólny typ konfiguracji:

```ts
export interface WaitForUpoOptions {
  pollIntervalMs?: number;
  maxAttempts?: number;
}
```

Ten typ jest używany przez workflowy sesji do czekania na UPO.

## Gdzie jest używane `WaitForUpoOptions`

- `OnlineSessionHandle.waitForUpo(options?)`
- `OnlineSessionHandle.waitForUpoParsed(options?)`
- `BatchSessionHandle.waitForUpo(options?)`
- `BatchSessionHandle.waitForUpoParsed(options?)`
- `OfflineInvoiceWorkflow.sendOfflineInvoice({ waitForUpoOptions })`
- `OfflineInvoiceWorkflow.sendOfflineTechnicalCorrection({ waitForUpoOptions })`

## Zachowanie pollingu i retry

`waitForUpo` (online i batch) działa tak samo:

1. Ustala `pollIntervalMs` i `maxAttempts`:
   - online: domyślnie `pollIntervalMs = 2000`, `maxAttempts = 60`
   - batch: domyślnie `pollIntervalMs = 2000`, `maxAttempts = 120`
2. W pętli wywołuje `status()` (GET statusu sesji).
3. Jeśli `status.code === 200` i istnieje `status.upo.pages[0]`, pobiera XML przez `GET page.downloadUrl` i zwraca treść.
4. Jeśli `status.code` nie jest `100` ani `200`, rzuca `KsefError` z kodem/opisem i ewentualnym `details`.
5. W pozostałych przypadkach usypia na `pollIntervalMs` i robi kolejną próbę.
6. Po przekroczeniu `maxAttempts` zwraca `null` (bez wyjątku).

Uwagi z implementacji:
- pobierana jest tylko pierwsza strona UPO (`pages[0]`);
- brak backoff/jitter, interwał jest stały;
- `status.code === 200` bez `pages[0]` nie kończy pętli, tylko czeka dalej.

## Wariant parsowany

- `waitForUpoParsed(options?)` woła `waitForUpo`.
- Jeśli XML jest dostępny, parsuje go przez `parseUpoXml(...)` z `src/xml/upo.ts`.
- Zwraca `UpoPotwierdzenie | null`.

## Integracja z offline workflow

`OfflineInvoiceWorkflow`:
- domyślnie czeka na UPO (`waitForUpo !== false`);
- przekazuje `waitForUpoOptions` bez zmian do `session.waitForUpo(...)`;
- zwraca jednocześnie surowe `upoXml` i sparsowane `upo`.

## Praktyczne użycie

Online, własny timeout:

```ts
const session = await client.workflows.sessions.online.open({
  formCode,
});

await session.sendInvoice({ invoice });
await session.close();

const upoXml = await session.waitForUpo({
  pollIntervalMs: 3000,
  maxAttempts: 40,
});
```

Batch, od razu wariant parsowany:

```ts
const batch = await client.workflows.sessions.batch.openUploadAndClose({
  formCode,
  invoices,
});

const upo = await batch.waitForUpoParsed({
  pollIntervalMs: 2000,
  maxAttempts: 120,
});
```

Offline bez czekania:

```ts
const result = await client.workflows.offline.sendOfflineInvoice({
  formCode,
  invoice,
  waitForUpo: false,
});

console.log(result.upoXml); // null
```
