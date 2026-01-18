# VerificationLinkService (QR linki)

Buduje linki weryfikacyjne dla QR-I i QR-II.

## Link QR-I (faktura)

```ts
const url = client.verificationLinks.buildInvoiceVerificationUrl(
  "5265877635",
  "01-01-2025",
  "BASE64_HASH",
);
```

## Link QR-II (certyfikat + podpis)

```ts
const url = client.verificationLinks.buildCertificateVerificationUrl({
  sellerNip: "5265877635",
  contextIdentifierType: "Nip",
  contextIdentifierValue: "5265877635",
  certificateSerial: "SERIAL",
  invoiceHash: "BASE64_HASH",
  privateKeyPem: "-----BEGIN PRIVATE KEY-----...",
  signatureFormat: "p1363",
});
```

## Uwagi

`VerificationLinkService` nie generuje obrazu QR (PNG/SVG). Tylko link.
