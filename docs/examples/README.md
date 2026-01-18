# Przyklady

Ponizsze przyklady pokazuja minimalne uzycie SDK. Wszystkie zakladaja Node >= 20.

## Connect + query

```ts
import { KsefClient } from "ksef-client-typescript";

const client = await KsefClient.connect({
  environment: "DEMO",
  token: process.env.KSEF_TOKEN!,
  context: { type: "Nip", value: "5265877635" },
});

const result = await client.invoices.queryInvoiceMetadata({
  subjectType: "Subject1",
  dateRange: { dateType: "Issue", from: "2025-01-01", to: "2025-01-31" },
});

console.log(result);
```

## Sesja online (workflow)

```ts
const session = await client.workflows.sessions.online.open({
  formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
});

await session.sendInvoice({ invoice: "<Faktura>...</Faktura>" });
await session.close();
const upoXml = await session.waitForUpo();
```

## Eksport paczki

```ts
const { referenceNumber, encryptionData } = await client.workflows.exports.startExport({
  filters: { subjectType: "Subject1" },
});

const status = await client.workflows.exports.waitForExport(referenceNumber);
const data = await client.workflows.exports.downloadAndProcessPackage(status, encryptionData);

console.log(data.metadataSummaries.length);
```

## Link weryfikacyjny (QR)

```ts
const url = client.verificationLinks.buildInvoiceVerificationUrl(
  "5265877635",
  "01-01-2025",
  "BASE64_HASH",
);

console.log(url);
```
