# Workflow: sesja interaktywna (online)

`OnlineSessionWorkflow` realizuje flow:
`open -> send invoice(s) -> close -> wait for UPO`.

## Metody

- `client.workflows.sessions.online.open(options)`
- `OnlineSessionHandle.sendInvoice(options)`
- `OnlineSessionHandle.close()`
- `OnlineSessionHandle.status()`
- `OnlineSessionHandle.waitForUpo(options?)`
- `OnlineSessionHandle.waitForUpoParsed(options?)`

## Przyklad 1: podstawowy flow online

```ts
const session = await client.workflows.sessions.online.open({
  formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
});

const send = await session.sendInvoice({ invoice: "<Faktura>...</Faktura>" });
console.log(send.referenceNumber);

await session.close();

const upoXml = await session.waitForUpo({
  pollIntervalMs: 2000,
  maxAttempts: 60,
});

console.log(upoXml ? "UPO downloaded" : "No UPO within polling window");
```

## Przyklad 2: offlineMode i hash korekty

```ts
await session.sendInvoice({
  invoice: "<FakturaKorygujaca>...</FakturaKorygujaca>",
  offlineMode: true,
  hashOfCorrectedInvoice: "BASE64_SHA256_HASH",
});
```

## Przyklad 3: `upoV43` i certyfikat jawnie

```ts
const certs = await client.security.getPublicKeyCertificates();
const symCert = certs.find((c) => c.usage.includes("SymmetricKeyEncryption"));
if (!symCert) {
  throw new Error("Missing SymmetricKeyEncryption certificate");
}

const session = await client.workflows.sessions.online.open({
  formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
  publicCertificateBase64Der: symCert.certificate,
  upoV43: true,
});
```

## Przyklad 4: status sesji i status faktury (thin API)

```ts
const sessionStatus = await session.status();
console.log(sessionStatus.status.code, sessionStatus.successfulInvoiceCount);

const invoices = await client.sessions.getSessionInvoices(session.referenceNumber, 0, 20);
console.log(invoices);

const failed = await client.sessions.getSessionFailedInvoices(session.referenceNumber, 20);
console.log(failed);
```

## Przyklad 5: parsowanie UPO XML

```ts
const upo = await session.waitForUpoParsed({ pollIntervalMs: 2000, maxAttempts: 60 });
if (upo) {
  console.log(upo.naglowek.kodFormularza);
}
```

## Uwagi

- Workflow sam przygotowuje encryption payload dla `sendInvoice(...)`.
- Dla niestandardowego flow mozesz uzyc bezposrednio `client.sessions.*`.
