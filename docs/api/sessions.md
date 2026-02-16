# Sessions

Thin client dla endpointow sesji online i batch oraz UPO.

## Metody

- `getSessions(query, continuationToken?)`
- `getSessionStatus(referenceNumber)`
- `getSessionInvoices(referenceNumber, pageOffset?, pageSize?, continuationToken?)`
- `getSessionInvoiceStatus(referenceNumber, invoiceReferenceNumber)`
- `getSessionInvoiceUpoByReferenceNumber(referenceNumber, invoiceReferenceNumber)`
- `getSessionInvoiceUpoByKsefNumber(referenceNumber, ksefNumber)`
- `getSessionUpo(referenceNumber, upoReferenceNumber)`
- `getSessionFailedInvoices(referenceNumber, pageSize?, continuationToken?)`
- `openOnlineSession(request, upoV43?)`
- `sendOnlineInvoice(referenceNumber, request)`
- `closeOnlineSession(referenceNumber)`
- `openBatchSession(request, upoV43?)`
- `closeBatchSession(referenceNumber)`

## `getSessions(query, continuationToken?)`

`query.sessionType` jest wymagane i musi miec wartosc `"Online"` albo `"Batch"`.

Opcjonalne filtry:
- `referenceNumber`
- `dateCreatedFrom`, `dateCreatedTo`
- `dateClosedFrom`, `dateClosedTo`
- `dateModifiedFrom`, `dateModifiedTo`
- `statuses` (tablica: `["InProgress", "Succeeded", "Failed", "Cancelled"]`)
- `pageSize`

## Co warto wiedziec

- `openOnlineSession(..., true)` i `openBatchSession(..., true)` dodaja `X-KSeF-Feature: upo-v4-3`.
- `sendOnlineInvoice(...)` wymaga zaszyfrowanego payloadu (`invoiceHash`, `encryptedInvoiceContent`, ...).
- Upload partow batch odbywa sie na pre-signed URL (`partUploadRequests`) i nie wymaga Bearer tokena.
- Odpowiedz dla list i statusow ma czesciowo typowanie `JsonObject` (forward-compatible z nowymi polami API).

## Przyklad 1: listowanie sesji + pagination

```ts
const firstPage = await client.sessions.getSessions(
  {
    sessionType: "Online",
    statuses: ["InProgress", "Succeeded"],
    pageSize: 20,
  },
  undefined,
);

const continuationToken =
  typeof firstPage === "object" && firstPage !== null
    ? (firstPage.continuationToken as string | undefined)
    : undefined;

if (continuationToken) {
  const nextPage = await client.sessions.getSessions(
    {
      sessionType: "Online",
      pageSize: 20,
    },
    continuationToken,
  );
  console.log(nextPage);
}
```

## Przyklad 2: online session (thin client)

```ts
import { CryptographyService } from "ksef-client-typescript";

const certs = await client.security.getPublicKeyCertificates();
const symCert = certs.find((c) => c.usage.includes("SymmetricKeyEncryption"));
if (!symCert) {
  throw new Error("Missing SymmetricKeyEncryption certificate");
}

const encryption = CryptographyService.getEncryptionData(symCert.certificate);

const open = await client.sessions.openOnlineSession(
  {
    formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
    encryption: encryption.encryptionInfo,
  },
  true,
);

const invoiceBytes = Buffer.from("<Faktura>...</Faktura>", "utf8");
const payload = CryptographyService.prepareInvoicePayload(
  invoiceBytes,
  encryption.cipherKey,
  encryption.cipherIv,
);

const send = await client.sessions.sendOnlineInvoice(open.referenceNumber, payload);
console.log(send.referenceNumber);

await client.sessions.closeOnlineSession(open.referenceNumber);
```

## Przyklad 3: status i UPO dla sesji/faktury

```ts
const sessionStatus = await client.sessions.getSessionStatus(sessionReferenceNumber);
console.log(sessionStatus.status.code, sessionStatus.status.description);

const invoiceStatus = await client.sessions.getSessionInvoiceStatus(
  sessionReferenceNumber,
  invoiceReferenceNumber,
);
console.log(invoiceStatus);

const invoiceUpoByRef = await client.sessions.getSessionInvoiceUpoByReferenceNumber(
  sessionReferenceNumber,
  invoiceReferenceNumber,
);

const invoiceUpoByKsef = await client.sessions.getSessionInvoiceUpoByKsefNumber(
  sessionReferenceNumber,
  "KSEF_NUMBER",
);

const sessionUpo = await client.sessions.getSessionUpo(
  sessionReferenceNumber,
  "UPO_REFERENCE_NUMBER",
);

console.log(invoiceUpoByRef.length, invoiceUpoByKsef.length, sessionUpo.length);
```

## Przyklad 4: batch session (manual open/upload/close)

```ts
import { CryptographyService } from "ksef-client-typescript";

const sourceZip = Buffer.from("...zip bytes...", "base64");
const certs = await client.security.getPublicKeyCertificates();
const symCert = certs.find((c) => c.usage.includes("SymmetricKeyEncryption"));
if (!symCert) {
  throw new Error("Missing SymmetricKeyEncryption certificate");
}

const encryption = CryptographyService.getEncryptionData(symCert.certificate);
const encryptedPart = CryptographyService.encryptAes256Cbc(
  sourceZip,
  encryption.cipherKey,
  encryption.cipherIv,
);

const open = await client.sessions.openBatchSession(
  {
    formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
    encryption: encryption.encryptionInfo,
    batchFile: {
      fileSize: sourceZip.length,
      fileHash: CryptographyService.sha256Base64(sourceZip),
      fileParts: [
        {
          ordinalNumber: 1,
          fileSize: encryptedPart.length,
          fileHash: CryptographyService.sha256Base64(encryptedPart),
        },
      ],
    },
  },
  true,
);

for (const part of open.partUploadRequests) {
  const headers = Object.fromEntries(
    Object.entries(part.headers ?? {}).filter((entry): entry is [string, string] =>
      typeof entry[1] === "string" && entry[1].length > 0,
    ),
  );

  await fetch(part.url, {
    method: part.method,
    headers,
    body: encryptedPart,
  });
}

await client.sessions.closeBatchSession(open.referenceNumber);
```

W praktyce dla batch rekomendowany jest workflow: [../workflows/batch-session.md](../workflows/batch-session.md).
