# Security

Thin client dla `/security/public-key-certificates`.

## Metody

- `getPublicKeyCertificates()`

## Co warto wiedziec

- Endpoint nie wymaga `accessToken`.
- Typowy scenariusz to wybor certyfikatow po `usage`:
  - `KsefTokenEncryption` dla szyfrowania tokena KSeF,
  - `SymmetricKeyEncryption` dla sesji online/batch i eksportu.

## Przyklad 1: pobranie certyfikatow i wybor po usage

```ts
const certs = await client.security.getPublicKeyCertificates();
const tokenCert = certs.find((c) => c.usage.includes("KsefTokenEncryption"));
const symCert = certs.find((c) => c.usage.includes("SymmetricKeyEncryption"));

if (!tokenCert || !symCert) {
  throw new Error("Missing required public key certificates");
}
```

## Przyklad 2: przygotowanie danych szyfrowania dla sesji

```ts
import { CryptographyService } from "ksef-client-typescript";

const certs = await client.security.getPublicKeyCertificates();
const symCert = certs.find((c) => c.usage.includes("SymmetricKeyEncryption"));
if (!symCert) {
  throw new Error("Missing SymmetricKeyEncryption certificate");
}

const encryption = CryptographyService.getEncryptionData(symCert.certificate);
console.log(encryption.encryptionInfo);
```

## Przyklad 3: szyfrowanie tokena KSeF

```ts
import { CryptographyService } from "ksef-client-typescript";

const certs = await client.security.getPublicKeyCertificates();
const tokenCert = certs.find((c) => c.usage.includes("KsefTokenEncryption"));
if (!tokenCert) {
  throw new Error("Missing KsefTokenEncryption certificate");
}

const encryptedToken = CryptographyService.encryptKsefToken(
  process.env.KSEF_TOKEN!,
  Date.now(),
  tokenCert.certificate,
);
console.log(encryptedToken.slice(0, 24));
```
