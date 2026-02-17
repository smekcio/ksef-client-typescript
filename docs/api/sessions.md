# Sesje (`sessions`)

Niskopoziomowy klient dla sesji online i batch oraz dokumentów UPO.

## Dostępne metody

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

## Najważniejsze informacje

- W `getSessions(...)` parametr `query.sessionType` jest wymagany i przyjmuje `"Online"` albo `"Batch"`.
- Filtry `getSessions(...)` obejmują m.in. `referenceNumber`, zakresy dat, `statuses` i `pageSize`.
- Dla `openOnlineSession(..., true)` oraz `openBatchSession(..., true)` SDK ustawia nagłówek `X-KSeF-Feature: upo-v4-3`.
- `sendOnlineInvoice(...)` wymaga zaszyfrowanego ładunku `SendInvoiceRequest` (`invoiceHash`, `encryptedInvoiceContent` itd.).
- Metody `getSessionInvoiceUpoByReferenceNumber`, `getSessionInvoiceUpoByKsefNumber` i `getSessionUpo` zwracają XML jako `string`.
- W sesji batch upload części odbywa się po `partUploadRequests` na pre-signed URL i nie korzysta z Bearer tokena.

## Przykłady TypeScript

### Listowanie sesji z kontynuacją

```ts
const firstPage = await client.sessions.getSessions({
  sessionType: "Online",
  statuses: ["InProgress", "Succeeded"],
  pageSize: 20,
});

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

### Sesja online: otwarcie, wysyłka faktury, zamknięcie

```ts
import { CryptographyService } from "ksef-client-typescript";

const certs = await client.security.getPublicKeyCertificates();
const symmetricCert = certs.find((c) => c.usage.includes("SymmetricKeyEncryption"));
if (!symmetricCert) {
  throw new Error("Brak certyfikatu z usage=SymmetricKeyEncryption");
}

const encryption = CryptographyService.getEncryptionData(symmetricCert.certificate);

const opened = await client.sessions.openOnlineSession(
  {
    formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
    encryption: encryption.encryptionInfo,
  },
  true,
);

const invoiceXml = Buffer.from("<Faktura>...</Faktura>", "utf8");
const payload = CryptographyService.prepareInvoicePayload(
  invoiceXml,
  encryption.cipherKey,
  encryption.cipherIv,
);

const sent = await client.sessions.sendOnlineInvoice(opened.referenceNumber, payload);
console.log("invoiceReferenceNumber:", sent.referenceNumber);

await client.sessions.closeOnlineSession(opened.referenceNumber);
```

### Statusy i UPO

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

### Sesja batch: ręczne open/upload/close

```ts
import { CryptographyService } from "ksef-client-typescript";

const sourceZip = Buffer.from("...zip-bytes...", "base64");
const certs = await client.security.getPublicKeyCertificates();
const symmetricCert = certs.find((c) => c.usage.includes("SymmetricKeyEncryption"));
if (!symmetricCert) {
  throw new Error("Brak certyfikatu z usage=SymmetricKeyEncryption");
}

const encryption = CryptographyService.getEncryptionData(symmetricCert.certificate);
const encryptedPart = CryptographyService.encryptAes256Cbc(
  sourceZip,
  encryption.cipherKey,
  encryption.cipherIv,
);

const opened = await client.sessions.openBatchSession(
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

for (const part of opened.partUploadRequests) {
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

await client.sessions.closeBatchSession(opened.referenceNumber);
```

Dla scenariusza produkcyjnego sesji batch zwykle wygodniejszy jest workflow:
[../workflows/batch-session.md](../workflows/batch-session.md).
