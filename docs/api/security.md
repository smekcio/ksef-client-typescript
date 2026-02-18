# Bezpieczeństwo (`security`)

Niskopoziomowy klient dla endpointu `/security/public-key-certificates`.

## Dostępne metody

- `getPublicKeyCertificates()`

## Najważniejsze informacje

- Endpoint nie wymaga `accessToken`.
- SDK nie udostępnia metody `getPublicKeyPem()`; w `client.security` dostępne jest tylko `getPublicKeyCertificates()`.
- Certyfikaty zwracają pole `usage`.
- Pole `certificate` jest używane w SDK jako `publicCertificateBase64Der`.
- `KsefTokenEncryption` służy do szyfrowania tokena KSeF.
- `SymmetricKeyEncryption` służy do szyfrowania danych sesji online/batch i eksportu.
- Jeśli potrzebujesz PEM, wykonaj konwersję lokalnie (np. `CryptographyService.toPemFromBase64Der(...)`).

## Przykłady TypeScript

### Pobranie certyfikatów i wybór po `usage`

```ts
const certs = await client.security.getPublicKeyCertificates();
const tokenCert = certs.find((c) => c.usage.includes("KsefTokenEncryption"));
const symmetricCert = certs.find((c) => c.usage.includes("SymmetricKeyEncryption"));

if (!tokenCert || !symmetricCert) {
  throw new Error("Brak wymaganych certyfikatów publicznych");
}
```

### Przygotowanie danych szyfrowania dla sesji

```ts
import { CryptographyService } from "ksef-client-typescript";

const certs = await client.security.getPublicKeyCertificates();
const symmetricCert = certs.find((c) => c.usage.includes("SymmetricKeyEncryption"));
if (!symmetricCert) {
  throw new Error("Brak certyfikatu z usage=SymmetricKeyEncryption");
}

const encryption = CryptographyService.getEncryptionData(symmetricCert.certificate);
console.log(encryption.encryptionInfo);
```

### Szyfrowanie tokena KSeF

```ts
import { CryptographyService } from "ksef-client-typescript";

const certs = await client.security.getPublicKeyCertificates();
const tokenCert = certs.find((c) => c.usage.includes("KsefTokenEncryption"));
if (!tokenCert) {
  throw new Error("Brak certyfikatu z usage=KsefTokenEncryption");
}

const encryptedToken = CryptographyService.encryptKsefToken(
  process.env.KSEF_TOKEN!,
  Date.now(),
  tokenCert.certificate,
);

console.log(encryptedToken.slice(0, 24));
```
