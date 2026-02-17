# Przykłady (TypeScript)

Ten dokument zawiera praktyczne fragmenty kodu dla najczęstszych scenariuszy integracyjnych.
Przykłady zakładają uruchamianie z katalogu `ksef-client-typescript`.

## Wymagania

- Node.js `>= 20`
- zainstalowana biblioteka `ksef-client-typescript`
- dostęp do środowiska KSeF (`TEST`, `DEMO` albo `PRD`) i danych uwierzytelniających

## Zmienne środowiskowe

Podstawowe:

- `KSEF_ENV` - `TEST`, `DEMO` albo `PRD` (domyślnie `DEMO`)
- `KSEF_NIP` - NIP kontekstu (np. `5265877635`)
- `KSEF_TOKEN` - token KSeF (systemowy)

XAdES (wariant PEM):

- `KSEF_XADES_CERT_PEM` - certyfikat XAdES w PEM
- `KSEF_XADES_KEY_PEM` - klucz prywatny XAdES w PEM
- `KSEF_XADES_KEY_PASSWORD` - hasło do klucza (opcjonalnie)

XAdES (wariant PKCS#12):

- `KSEF_XADES_PKCS12_PATH` - ścieżka do `.p12` / `.pfx`
- `KSEF_XADES_PKCS12_PASSWORD` - hasło do kontenera (opcjonalnie)

## Szkielet startowy

```ts
import { KsefClient } from "ksef-client-typescript";

const env = (process.env.KSEF_ENV as "TEST" | "DEMO" | "PRD") ?? "DEMO";
const nip = process.env.KSEF_NIP ?? "5265877635";
```

## 1) `connect(...)` + query metadata

```ts
const client = await KsefClient.connect({
  environment: env,
  token: process.env.KSEF_TOKEN!,
  context: { type: "Nip", value: nip },
  pollIntervalMs: 2000,
  maxAttempts: 90,
});

const result = await client.invoices.queryInvoiceMetadata(
  {
    subjectType: "Subject1",
    dateRange: { dateType: "Issue", from: "2025-01-01", to: "2025-01-31" },
  },
  0,
  10,
  "Desc",
);

console.log(result);
```

## 2) Manualny auth tokenem KSeF

```ts
const client = new KsefClient({ environment: env });

const tokens = await client.workflows.auth.authenticateWithKsefToken({
  token: process.env.KSEF_TOKEN!,
  context: { type: "Nip", value: nip },
  pollIntervalMs: 2000,
  maxAttempts: 90,
});

client.authManager.setTokens(tokens);
console.log(tokens.accessToken.validUntil, tokens.refreshToken.validUntil);
```

## 3) Auth XAdES (certyfikat + klucz PEM)

```ts
import { XadesKeyPair } from "ksef-client-typescript";

const client = new KsefClient({ environment: env });

const keyPair = XadesKeyPair.fromPem({
  certificatePem: process.env.KSEF_XADES_CERT_PEM!,
  privateKeyPem: process.env.KSEF_XADES_KEY_PEM!,
  privateKeyPassword: process.env.KSEF_XADES_KEY_PASSWORD,
});

const tokens = await client.workflows.auth.authenticateWithCertificate({
  keyPair,
  context: { type: "Nip", value: nip },
  subjectIdentifierType: "certificateSubject",
  verifyCertificateChain: true,
  enforceXadesCompliance: true,
  signaturePackaging: "enveloped",
});

client.authManager.setTokens(tokens);
```

## 4) Auth XAdES z PKCS#12 (`.p12` / `.pfx`)

```ts
import { KsefClient, XadesKeyPair } from "ksef-client-typescript";

const client = new KsefClient({ environment: env });

const keyPair = await XadesKeyPair.fromPkcs12File({
  pkcs12Path: process.env.KSEF_XADES_PKCS12_PATH!,
  pkcs12Password: process.env.KSEF_XADES_PKCS12_PASSWORD,
});

const tokens = await client.workflows.auth.authenticateWithCertificate({
  keyPair,
  context: { type: "Nip", value: nip },
});

client.authManager.setTokens(tokens);
```

Uwaga: wariant PKCS#12 wymaga opcjonalnej zależności `node-forge`.

Poniższe przykłady (5-10) zakładają, że masz już uwierzytelniony obiekt `client`.

## 5) Sesja online: open -> send -> close -> UPO

```ts
const session = await client.workflows.sessions.online.open({
  formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
});

const send = await session.sendInvoice({ invoice: "<Faktura>...</Faktura>" });
await session.close();

const upoXml = await session.waitForUpo({ pollIntervalMs: 2000, maxAttempts: 60 });
console.log(send.referenceNumber, Boolean(upoXml));
```

## 6) Sesja batch: `openUploadAndClose(...)` + UPO

```ts
const batch = await client.workflows.sessions.batch.openUploadAndClose({
  formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
  invoices: [
    { fileName: "invoice-1.xml", invoice: "<Faktura>...</Faktura>" },
    { fileName: "invoice-2.xml", invoice: "<Faktura>...</Faktura>" },
  ],
  parallelism: 4,
});

const upoXml = await batch.waitForUpo({ pollIntervalMs: 2000, maxAttempts: 120 });
console.log(batch.referenceNumber, Boolean(upoXml));
```

## 7) Eksport: start -> wait -> download + decrypt + unzip

```ts
const { referenceNumber, encryptionData } = await client.workflows.exports.startExport({
  filters: {
    subjectType: "Subject1",
    dateRange: { dateType: "PermanentStorage", from: "2025-01-01", to: "2025-01-31" },
  },
});

const status = await client.workflows.exports.waitForExport(referenceNumber, {
  pollIntervalMs: 2000,
  maxAttempts: 120,
});

const pkg = await client.workflows.exports.downloadAndProcessPackage(status, encryptionData, {
  verifyHashes: true,
});

console.log(pkg.metadataSummaries.length, Object.keys(pkg.invoiceXmlFiles).length);
```

## 8) Eksport przyrostowy z continuation points

```ts
const continuationPoints: Record<string, string | undefined> = {};

const incremental = await client.workflows.exportsIncremental.run({
  subjectType: "Subject1",
  windowFrom: "2025-01-01",
  windowTo: "2025-01-31",
  continuationPoints,
  verifyHashes: true,
  maxIterations: 20,
});

console.log(incremental.referenceNumbers);
console.log(incremental.continuationPoints.Subject1);
```

## 9) Tryb offline: wysyłka + instrukcje

```ts
const result = await client.workflows.offline.sendOfflineInvoice({
  formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
  invoice: "<Faktura>...</Faktura>",
  waitForUpo: true,
  waitForUpoOptions: { pollIntervalMs: 2000, maxAttempts: 60 },
});

const guide = client.workflows.offline.getProcedureInstructions("offline24");
console.log(result.invoiceReferenceNumber, guide.sendDeadline);
console.log(guide.operationalSteps);
```

## 10) Blokowanie/odblokowanie kontekstu (testdata)

```ts
await client.testdata.blockContext({
  contextIdentifier: { type: "Nip", value: nip },
});

await client.testdata.unblockContext({
  contextIdentifier: { type: "Nip", value: nip },
});
```

## Dalsza dokumentacja

- Workflowy: [../workflows/README.md](../workflows/README.md)
- API reference: [../api/README.md](../api/README.md)
- Błędy i retry: [../errors.md](../errors.md)
