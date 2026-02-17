# Przyklady

Ponizej sa praktyczne scenariusze TypeScript. Wszystkie przyklady zakladaja Node >= 20.

## Zmienne srodowiskowe

- `KSEF_ENV` - `TEST`, `DEMO` albo `PRD`
- `KSEF_TOKEN` - token KSeF (systemowy)
- `KSEF_NIP` - NIP kontekstu
- `KSEF_XADES_CERT_PEM` - certyfikat XAdES (PEM)
- `KSEF_XADES_KEY_PEM` - klucz prywatny XAdES (PEM)

## 1) Connect + query metadata

```ts
import { KsefClient } from "ksef-client-typescript";

const client = await KsefClient.connect({
  environment: (process.env.KSEF_ENV as "TEST" | "DEMO" | "PRD") ?? "DEMO",
  token: process.env.KSEF_TOKEN!,
  context: { type: "Nip", value: process.env.KSEF_NIP ?? "5265877635" },
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

## 2) Manual auth token workflow + ustawienie tokenow

```ts
import { KsefClient } from "ksef-client-typescript";

const client = new KsefClient({ environment: "DEMO" });

const tokens = await client.workflows.auth.authenticateWithKsefToken({
  token: process.env.KSEF_TOKEN!,
  context: { type: "Nip", value: process.env.KSEF_NIP ?? "5265877635" },
  maxAttempts: 90,
  pollIntervalMs: 2000,
});

client.authManager.setTokens(tokens);
console.log(tokens.accessToken.validUntil, tokens.refreshToken.validUntil);
```

## 3) XAdES auth z `enforceXadesCompliance`

```ts
import { KsefClient, XadesKeyPair } from "ksef-client-typescript";

const client = new KsefClient({ environment: "DEMO" });

const keyPair = XadesKeyPair.fromPem({
  certificatePem: process.env.KSEF_XADES_CERT_PEM!,
  privateKeyPem: process.env.KSEF_XADES_KEY_PEM!,
});

const tokens = await client.workflows.auth.authenticateWithCertificate({
  keyPair,
  context: { type: "Nip", value: process.env.KSEF_NIP ?? "5265877635" },
  verifyCertificateChain: true,
  enforceXadesCompliance: true,
  signaturePackaging: "enveloped",
});

client.authManager.setTokens(tokens);
```

## 4) Sesja online: open -> send -> close -> UPO

```ts
const session = await client.workflows.sessions.online.open({
  formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
});

await session.sendInvoice({ invoice: "<Faktura>...</Faktura>" });
await session.close();

const upoXml = await session.waitForUpo({ pollIntervalMs: 2000, maxAttempts: 60 });
console.log(upoXml);
```

## 5) Sesja batch: openUploadAndClose + UPO

```ts
const batch = await client.workflows.sessions.batch.openUploadAndClose({
  formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
  invoices: [
    { fileName: "invoice-1.xml", invoice: "<Faktura>...</Faktura>" },
    { fileName: "invoice-2.xml", invoice: "<Faktura>...</Faktura>" },
  ],
  parallelism: 4,
});

const upo = await batch.waitForUpo({ pollIntervalMs: 2000, maxAttempts: 120 });
console.log(batch.referenceNumber, Boolean(upo));
```

## 6) Eksport: start -> wait -> download + decrypt + unzip

```ts
const { referenceNumber, encryptionData } = await client.workflows.exports.startExport({
  filters: {
    subjectType: "Subject1",
    dateRange: { dateType: "PermanentStorage", from: "2025-01-01", to: "2025-01-31" },
  },
});

const status = await client.workflows.exports.waitForExport(referenceNumber);
const pkg = await client.workflows.exports.downloadAndProcessPackage(status, encryptionData, {
  verifyHashes: true,
});

console.log(pkg.metadataSummaries.length, Object.keys(pkg.invoiceXmlFiles).length);
```

## 7) Testdata block/unblock context

```ts
await client.testdata.blockContext({
  contextIdentifier: { type: "Nip", value: "5265877635" },
});

await client.testdata.unblockContext({
  contextIdentifier: { type: "Nip", value: "5265877635" },
});
```

## 8) Tryb offline: wysylka + instrukcje postepowania

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

## Dalej

- API reference: [../api/README.md](../api/README.md)
- Workflows: [../workflows/README.md](../workflows/README.md)
- Bledy i retry: [../errors.md](../errors.md)
