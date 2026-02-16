# Workflows

Workflowy to gotowe scenariusze, ktore lacza endpointy API z operacjami lokalnymi (szyfrowanie, ZIP, polling).
Sa dostepne pod `client.workflows`.

## Strony

- [Uwierzytelnianie](auth.md)
- [Sesja interaktywna](online-session.md)
- [Sesja wsadowa](batch-session.md)
- [Eksport paczek](export.md)

## Kiedy workflow zamiast thin API

- Uzyj thin API, gdy chcesz 1:1 kontrolowac request/response endpointu.
- Uzyj workflow, gdy potrzebujesz kompletnego procesu (auth, online, batch, eksport).

## Przyklad 1: auth + online (end-to-end)

```ts
import { KsefClient } from "ksef-client-typescript";

const client = await KsefClient.connect({
  environment: "DEMO",
  token: process.env.KSEF_TOKEN!,
  context: { type: "Nip", value: "5265877635" },
});

const online = await client.workflows.sessions.online.open({
  formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
});

await online.sendInvoice({ invoice: "<Faktura>...</Faktura>" });
await online.close();

const upo = await online.waitForUpo({ pollIntervalMs: 2000, maxAttempts: 60 });
console.log(Boolean(upo));
```

## Przyklad 2: eksport + incremental continuation points

```ts
const continuationPoints: Record<string, string | undefined> = {};

const result = await client.workflows.exportsIncremental.run({
  subjectType: "Subject1",
  windowFrom: "2025-01-01",
  windowTo: "2025-01-31",
  continuationPoints,
  verifyHashes: true,
});

console.log(result.referenceNumbers, result.continuationPoints);
```
