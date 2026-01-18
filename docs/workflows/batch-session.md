# Workflow: sesja wsadowa (batch)

Workflow `BatchSessionWorkflow` przygotowuje ZIP, dzieli na czesci, szyfruje, uploaduje i zamyka sesje.

## Przyklad (lista faktur)

```ts
const batch = await client.workflows.sessions.batch.openUploadAndClose({
  formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
  invoices: [
    { fileName: "1.xml", invoice: "<Faktura>...</Faktura>" },
    { fileName: "2.xml", invoice: "<Faktura>...</Faktura>" },
  ],
  parallelism: 4,
});

const upoXml = await batch.waitForUpo();
```

## Przyklad (gotowy ZIP)

```ts
const batch = await client.workflows.sessions.batch.openUploadAndClose({
  formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
  zipBytes: zipBuffer,
});
```
