# Workflow: sesja interaktywna (online)

Workflow `OnlineSessionWorkflow` laczy otwarcie sesji, wysylke faktur, zamkniecie i UPO.

## Przyklad

```ts
const session = await client.workflows.sessions.online.open({
  formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
});

await session.sendInvoice({ invoice: "<Faktura>...</Faktura>" });
await session.close();

const upoXml = await session.waitForUpo({ pollIntervalMs: 2000, maxAttempts: 60 });
```

## Opcje

- `offlineMode` i `hashOfCorrectedInvoice` w `sendInvoice(...)`
- `upoV43` w `open(...)` (X-KSeF-Feature: upo-v4-3)
