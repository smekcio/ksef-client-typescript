# Workflow: sesja wsadowa (batch)

`BatchSessionWorkflow` realizuje flow:
`prepare zip -> split parts -> encrypt -> open batch -> upload parts -> close`.

## Metoda

- `client.workflows.sessions.batch.openUploadAndClose(options)`

`options`:
- `formCode` (wymagane)
- `invoices` albo `zipBytes` (jedno z dwoch)
- `publicCertificateBase64Der` (opcjonalnie)
- `offlineMode` (opcjonalnie)
- `upoV43` (opcjonalnie)
- `parallelism` (opcjonalnie)
- `maxPartSizeBytes` (opcjonalnie; domyslnie 100 MB)

## Przyklad 1: batch z listy faktur

```ts
const batch = await client.workflows.sessions.batch.openUploadAndClose({
  formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
  invoices: [
    { fileName: "invoice-1.xml", invoice: "<Faktura>...</Faktura>" },
    { fileName: "invoice-2.xml", invoice: "<Faktura>...</Faktura>" },
  ],
  parallelism: 4,
});

console.log(batch.referenceNumber);
```

## Przyklad 2: batch z gotowego ZIP

```ts
import { readFile } from "node:fs/promises";

const zipBytes = await readFile("./invoices.zip");

const batch = await client.workflows.sessions.batch.openUploadAndClose({
  formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
  zipBytes,
  upoV43: true,
  parallelism: 2,
});

console.log(batch.referenceNumber);
```

## Przyklad 3: polling UPO dla sesji batch

```ts
const upoXml = await batch.waitForUpo({
  pollIntervalMs: 2000,
  maxAttempts: 120,
});

console.log(upoXml ? "UPO ready" : "No UPO in polling window");
```

## Przyklad 4: status sesji i lista blednych faktur

```ts
const status = await batch.status();
console.log(status.status.code, status.failedInvoiceCount);

const failed = await client.sessions.getSessionFailedInvoices(batch.referenceNumber, 100);
console.log(failed);
```

## Przyklad 5: custom cert + custom part size

```ts
const certs = await client.security.getPublicKeyCertificates();
const symCert = certs.find((c) => c.usage.includes("SymmetricKeyEncryption"));
if (!symCert) {
  throw new Error("Missing SymmetricKeyEncryption certificate");
}

await client.workflows.sessions.batch.openUploadAndClose({
  formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
  invoices: [{ fileName: "invoice.xml", invoice: "<Faktura>...</Faktura>" }],
  publicCertificateBase64Der: symCert.certificate,
  maxPartSizeBytes: 10 * 1024 * 1024,
});
```

## Uwagi

- Upload partow idzie na pre-signed URL (bez Bearer tokena).
- `parallelism` kontroluje rownoleglosc uploadu partow.
- Po `close` status i UPO sa asynchroniczne, wiec wymagany jest polling.
