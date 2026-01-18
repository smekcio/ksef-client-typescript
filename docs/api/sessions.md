# Sessions

Thin client dla sesji online/batch oraz UPO.

## Metody (wybrane)

- `getSessions(pageSize?, continuationToken?, params?)`
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

## Przyklad (online)

```ts
const open = await client.sessions.openOnlineSession({
  formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
  encryption: {
    encryptedSymmetricKey: "BASE64",
    initializationVector: "BASE64",
  },
});

const sent = await client.sessions.sendOnlineInvoice(open.referenceNumber, {
  invoiceHash: "...",
  invoiceSize: 123,
  encryptedInvoiceHash: "...",
  encryptedInvoiceSize: 456,
  encryptedInvoiceContent: "BASE64",
});

await client.sessions.closeOnlineSession(open.referenceNumber);
```
