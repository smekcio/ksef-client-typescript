# Linki weryfikacyjne (`VerificationLinkService`)

Usługa buduje URL do umieszczenia na fakturze (np. jako kod QR).

## `new VerificationLinkService({ baseQrUrl })`

W `KsefClient` usługa jest dostępna jako `client.verificationLinks` i domyślnie używa URL QR dobranego z `environment`.

## `buildInvoiceVerificationUrl(nip, issueDate, invoiceHash) -> string`

Buduje URL dla „KOD I” (weryfikacja faktury).

Parametry:
- `nip`: NIP sprzedawcy
- `issueDate`: `Date` albo string (`DD-MM-YYYY`)
- `invoiceHash`: Base64 lub Base64Url (wynikowy URL używa Base64Url)

Przykład:

```ts
const url = client.verificationLinks.buildInvoiceVerificationUrl(
  "5265877635",
  "01-01-2025",
  "BASE64_HASH",
);
```

## `buildCertificateVerificationUrl(options) -> string`

Buduje URL dla „KOD II” (offline, podpisany lokalnym kluczem prywatnym).

Najważniejsze pola:
- `sellerNip`
- `contextIdentifierType`, `contextIdentifierValue`
- `certificateSerial`
- `invoiceHash` (Base64 lub Base64Url)
- `privateKeyPem` (wymagany)
- `signatureFormat`: `"p1363"` (domyślnie) albo `"der"` dla ECDSA

Przykład:

```ts
const url = client.verificationLinks.buildCertificateVerificationUrl({
  sellerNip: "5265877635",
  contextIdentifierType: "Nip",
  contextIdentifierValue: "5265877635",
  certificateSerial: "SERIAL",
  invoiceHash: "BASE64_HASH",
  privateKeyPem: process.env.KSEF_QR_PRIVATE_KEY_PEM!,
  signatureFormat: "p1363",
});
```

Powiązane: [QR](qr.md).
