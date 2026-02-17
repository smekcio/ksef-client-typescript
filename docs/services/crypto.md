# Kryptografia i metadane (`CryptographyService`)

`CryptographyService` dostarcza funkcje używane w sesjach online, batch oraz eksporcie.

W workflowach są one wywoływane automatycznie przez:
- `OnlineSessionWorkflow`
- `BatchSessionWorkflow`
- `InvoiceExportWorkflow`

## `EncryptionData`

Struktura zwracana przez `getEncryptionData(...)`:
- `cipherKey`: 32 bajty (AES-256)
- `cipherIv`: 16 bajtów (AES-CBC)
- `encryptionInfo`: dane do payloadu API (`encryptedSymmetricKey`, `initializationVector`)

## Generatory i hashe

- `generateAesKey() -> Buffer` (32B)
- `generateIv() -> Buffer` (16B)
- `sha256Base64(data) -> string`
- `sha256Base64Url(data) -> string`

## AES

- `encryptAes256Cbc(data, key, iv) -> Buffer`
- `decryptAes256Cbc(data, key, iv) -> Buffer`

## Token KSeF

- `encryptKsefTokenRsa(token, timestampMs, publicCertificate) -> Buffer`
- `encryptKsefTokenEc(token, timestampMs, publicCertificate, outputFormat?) -> Buffer`
- `encryptKsefToken(token, timestampMs, publicCertificate, method?, ecOutputFormat?) -> string`

`encryptKsefToken(...)` zwraca Base64 i jest najczęściej używane przez `AuthCoordinator`.

## Certyfikaty i metadane

- `toPemFromBase64Der(base64Der, label?) -> string`
- `normalizeCertificatePem(certificate) -> string`
- `getMetaData(data) -> { hashSha256Base64, fileSize }`

## `getEncryptionData(publicCertBase64Der) -> EncryptionData`

Generuje klucz symetryczny + IV i szyfruje klucz certyfikatem KSeF (`SymmetricKeyEncryption`, RSA-OAEP SHA-256).

## `prepareInvoicePayload(invoiceXml, cipherKey, cipherIv)`

Buduje payload dla `sendOnlineInvoice`:
- liczy `invoiceHash` i `encryptedInvoiceHash`
- szyfruje XML faktury AES-256-CBC
- zwraca `encryptedInvoiceContent` jako Base64

Przykład:

```ts
import { CryptographyService } from "ksef-client-typescript";

const key = CryptographyService.generateAesKey();
const iv = CryptographyService.generateIv();

const invoiceXml = Buffer.from("<Invoice>...</Invoice>", "utf8");
const payload = CryptographyService.prepareInvoicePayload(invoiceXml, key, iv);

console.log(payload.invoiceHash, payload.encryptedInvoiceSize);
```
