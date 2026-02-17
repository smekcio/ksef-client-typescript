# Workflow: sesja wsadowa (batch)

`BatchSessionWorkflow` realizuje flow:
`prepare zip -> split parts -> encrypt -> open batch -> upload parts -> close`.

Dostęp: `client.workflows.sessions.batch`.

## Metoda

- `client.workflows.sessions.batch.openUploadAndClose(options)`

Workflow zwraca `BatchSessionHandle` z metodami:

- `status()`
- `waitForUpo(options?)`
- `waitForUpoParsed(options?)`

## Opcje `openUploadAndClose(options)`

- `formCode` (wymagane)
- `invoices` albo `zipBytes` (wymagane jedno z dwóch)
- `publicCertificateBase64Der` (opcjonalnie; domyślnie certyfikat `SymmetricKeyEncryption`)
- `offlineMode` (opcjonalnie)
- `upoV43` (opcjonalnie)
- `parallelism` (opcjonalnie; domyślnie `1`)
- `maxPartSizeBytes` (opcjonalnie; domyślnie `100 * 1024 * 1024`)

## Przykład 1: batch z listy faktur

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

## Przykład 2: batch z gotowego ZIP

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

## Przykład 3: polling statusu i UPO

Zakłada obiekt `batch` z przykładu 1 albo 2.

```ts
const status = await batch.status();
console.log(status.status.code, status.failedInvoiceCount);

const upoXml = await batch.waitForUpo({
  pollIntervalMs: 2000,
  maxAttempts: 120,
});

console.log(upoXml ? "UPO ready" : "No UPO in polling window");
```

## Przykład 4: lista faktur błędnych

Zakłada obiekt `batch` z przykładu 1 albo 2.

```ts
const failed = await client.sessions.getSessionFailedInvoices(batch.referenceNumber, 100);
console.log(failed);
```

## Przykład 5: jawny certyfikat i mniejszy rozmiar partów

```ts
const certs = await client.security.getPublicKeyCertificates();
const symCert = certs.find((item) => item.usage.includes("SymmetricKeyEncryption"));
if (!symCert) {
  throw new Error("Missing SymmetricKeyEncryption certificate");
}

await client.workflows.sessions.batch.openUploadAndClose({
  formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
  invoices: [{ fileName: "invoice.xml", invoice: "<Faktura>...</Faktura>" }],
  publicCertificateBase64Der: symCert.certificate,
  maxPartSizeBytes: 10 * 1024 * 1024,
  offlineMode: false,
  parallelism: 3,
});
```

## Uwagi operacyjne

- Upload partów odbywa się na pre-signed URL, czyli bez Bearer tokena.
- Podział ZIP musi nastąpić przed szyfrowaniem; workflow robi to automatycznie.
- `parallelism` kontroluje równoległość uploadu partów.
- Po `close` status i UPO są asynchroniczne, dlatego polling jest wymagany.
- Czas na wysyłkę w sesji wsadowej zależy od liczby partów, więc zbyt mały `maxPartSizeBytes` może niepotrzebnie zwiększyć ryzyko timeoutu procesu.
