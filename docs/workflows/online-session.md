# Workflow: sesja interaktywna (online)

`OnlineSessionWorkflow` realizuje standardowy flow:
`open -> send invoice(s) -> close -> wait for UPO`.

Dostęp: `client.workflows.sessions.online`.

## Metody

- `client.workflows.sessions.online.open(options)`
- `OnlineSessionHandle.sendInvoice(options)`
- `OnlineSessionHandle.close()`
- `OnlineSessionHandle.status()`
- `OnlineSessionHandle.waitForUpo(options?)`
- `OnlineSessionHandle.waitForUpoParsed(options?)`

## Opcje `open(options)`

- `formCode` (wymagane)
- `publicCertificateBase64Der` (opcjonalnie, domyślnie certyfikat `SymmetricKeyEncryption`)
- `upoV43` (opcjonalnie, dodaje nagłówek `X-KSeF-Feature: upo-v4-3`)

## Opcje `sendInvoice(options)`

- `invoice` (wymagane; `string`, `Buffer`, obiekt XML, `FakturaInput`, `PEF UBL`)
- `offlineMode` (opcjonalnie)
- `hashOfCorrectedInvoice` (opcjonalnie; używane przy korekcie technicznej offline)

## Kiedy używać `upoV43`, `offlineMode`, `hashOfCorrectedInvoice`

`upoV43`:

- ustawiasz tylko przy `open(...)`,
- SDK doda nagłówek `X-KSeF-Feature: upo-v4-3` do otwarcia sesji,
- używaj, gdy po stronie integracji chcesz jawnie negocjować wariant UPO v4.3.

`offlineMode`:

- ustawiasz per dokument w `sendInvoice(...)`,
- używaj dla dokumentów wysyłanych w procedurze offline (np. po okresie niedostępności, zgodnie z procesem biznesowym firmy),
- w standardowym scenariuszu online zwykle pozostaje `undefined`/`false`.

`hashOfCorrectedInvoice`:

- stosuj przy technicznej korekcie dokumentu wysłanego w trybie offline,
- wartość to hash (Base64 SHA-256) dokumentu, który korygujesz,
- praktycznie powinno iść razem z `offlineMode: true`.

Uwagi implementacyjne:

- w `OnlineSessionWorkflow` pole `hashOfCorrectedInvoice` jest dodawane do requestu tylko gdy ma niepustą wartość,
- jeśli potrzebujesz wymuszonej walidacji tego pola (niepusty hash), użyj dedykowanego [workflow offline](offline.md), który to egzekwuje.

## Przykład 1: podstawowy flow online

```ts
const session = await client.workflows.sessions.online.open({
  formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
});

const first = await session.sendInvoice({ invoice: "<Faktura>...</Faktura>" });
const second = await session.sendInvoice({ invoice: "<Faktura>...</Faktura>" });

console.log(first.referenceNumber, second.referenceNumber);

await session.close();

const upoXml = await session.waitForUpo({
  pollIntervalMs: 2000,
  maxAttempts: 60,
});

console.log(upoXml ? "UPO downloaded" : "No UPO within polling window");
```

## Przykład 2: status sesji i status faktur

Zakłada obiekty `session` i `first` z przykładu 1.

```ts
const sessionStatus = await session.status();
console.log(sessionStatus.status.code, sessionStatus.successfulInvoiceCount);

const invoices = await client.sessions.getSessionInvoices(session.referenceNumber, 0, 20);
console.log(invoices);

const invoiceStatus = await client.sessions.getSessionInvoiceStatus(
  session.referenceNumber,
  first.referenceNumber,
);
console.log(invoiceStatus);

const failed = await client.sessions.getSessionFailedInvoices(session.referenceNumber, 20);
console.log(failed);
```

## Przykład 3: `offlineMode` i `hashOfCorrectedInvoice`

Zakłada otwartą sesję (`session`).

```ts
await session.sendInvoice({
  invoice: "<FakturaKorygujaca>...</FakturaKorygujaca>",
  offlineMode: true,
  hashOfCorrectedInvoice: "BASE64_SHA256_HASH_ODRZUCONEJ_FAKTURY",
});
```

## Przykład 4: jawny certyfikat i `upoV43`

```ts
const certs = await client.security.getPublicKeyCertificates();
const symCert = certs.find((item) => item.usage.includes("SymmetricKeyEncryption"));
if (!symCert) {
  throw new Error("Missing SymmetricKeyEncryption certificate");
}

const session = await client.workflows.sessions.online.open({
  formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
  publicCertificateBase64Der: symCert.certificate,
  upoV43: true,
});
```

## Przykład 5: parsowanie UPO XML

```ts
const upo = await session.waitForUpoParsed({ pollIntervalMs: 2000, maxAttempts: 60 });
if (upo) {
  console.log(upo.kodFormularza, upo.numerReferencyjnySesji);
  console.log(upo.dokumenty[0]?.numerKSeFDokumentu);
}
```

## Uwagi operacyjne

- Workflow sam przygotowuje payload szyfrowany dla `sendInvoice(...)`, więc nie musisz ręcznie budować `encryptedInvoiceContent`.
- `waitForUpo(...)` zwraca `null`, gdy polling przekroczy limit prób (`maxAttempts`).
- Domyślny polling UPO: `pollIntervalMs=2000`, `maxAttempts=60`.
- Po `close()` status sesji i UPO są asynchroniczne, więc polling jest normalnym elementem procesu.
- Dla kompletnego scenariusza offline (z instrukcjami postępowania) użyj [workflow offline](offline.md).
