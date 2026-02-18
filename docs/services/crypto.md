# Kryptografia i metadane (`CryptographyService`)

`CryptographyService` jest zdefiniowany w `src/crypto/cryptographyService.ts`.
Workflowy (`OnlineSessionWorkflow`, `BatchSessionWorkflow`, `InvoiceExportWorkflow`) używają go automatycznie, ale można go też wywoływać bezpośrednio.

## Typy zwracane

`EncryptionData`:

- `cipherKey: Buffer` (32 bajty, losowy klucz AES)
- `cipherIv: Buffer` (16 bajtów, losowy IV)
- `encryptionInfo.encryptedSymmetricKey: string` (Base64)
- `encryptionInfo.initializationVector: string` (Base64)

`PreparedInvoicePayload`:

- `invoiceHash: string` (SHA-256 Base64 oryginalnego XML)
- `invoiceSize: number` (liczba bajtów oryginalnego XML)
- `encryptedInvoiceHash: string` (SHA-256 Base64 zaszyfrowanych bajtów)
- `encryptedInvoiceSize: number` (liczba bajtów po szyfrowaniu)
- `encryptedInvoiceContent: string` (Base64 zaszyfrowanych bajtów)

## Generowanie i hashowanie

- `generateAesKey(): Buffer`  
  Zwraca `crypto.randomBytes(32)`.

- `generateIv(): Buffer`  
  Zwraca `crypto.randomBytes(16)`.

- `sha256Base64(data: Buffer | string): string`  
  SHA-256 + Base64.

- `sha256Base64Url(data: Buffer | string): string`  
  SHA-256 + Base64URL (używa `toBase64Url`).

## AES helpers

- `encryptAes256Cbc(data: Buffer, key: Buffer, iv: Buffer): Buffer`
- `decryptAes256Cbc(data: Buffer, key: Buffer, iv: Buffer): Buffer`

Obie metody używają `aes-256-cbc` (`crypto.createCipheriv` / `createDecipheriv`).

## Token KSeF

### `encryptKsefTokenRsa(token, timestampMs, publicCertificate): Buffer`

- payload wejściowy: `${token.trim()}|${timestampMs}` zakodowany jako UTF-8;
- certyfikat przechodzi przez `normalizeCertificatePem(...)`;
- szyfrowanie: `RSA_PKCS1_OAEP_PADDING` + `oaepHash: "sha256"`.

### `encryptKsefTokenEc(token, timestampMs, publicCertificate, outputFormat?): Buffer`

- `outputFormat` domyślnie `"java"` (`"java" | "csharp"`);
- payload wejściowy: `${token.trim()}|${timestampMs}`;
- tworzony jest efemeryczny klucz EC `prime256v1`;
- sekret ECDH: `crypto.diffieHellman(...)`;
- klucz AES to pierwsze 32 bajty sekretu (`sharedSecret.subarray(0, 32)`);
- szyfrowanie `aes-256-gcm` z nonce 12B;
- skład wyniku:
  - `"java"`: `spki || nonce || ciphertext || tag`
  - `"csharp"`: `spki || nonce || tag || ciphertext`

### `encryptKsefToken(token, timestampMs, publicCertificate, method?, ecOutputFormat?): string`

- `method` domyślnie `"rsa"` (`"rsa" | "ec"`);
- `ecOutputFormat` domyślnie `"java"`;
- wynik końcowy zawsze jest zwracany jako Base64 (`string`).

## Certyfikaty i metadane

- `toPemFromBase64Der(base64Der: string, label = "CERTIFICATE"): string`  
  Buduje PEM z podziałem na linie po 64 znaki.

- `normalizeCertificatePem(certificate: string): string`  
  Jeśli wejście zawiera `"BEGIN "`, zwraca PEM z końcowym `\n`; w przeciwnym razie traktuje wejście jako Base64 DER i konwertuje przez `toPemFromBase64Der`.

- `getMetaData(data: Buffer | Uint8Array): { hashSha256Base64, fileSize }`  
  Najpierw normalizuje do `Buffer`, potem liczy hash i rozmiar.

## `getEncryptionData(publicCertBase64Der)`

Parametr to certyfikat KSeF w Base64 DER. Metoda:

1. generuje `cipherKey` (32B) i `cipherIv` (16B),
2. konwertuje certyfikat do PEM (`toPemFromBase64Der`),
3. szyfruje `cipherKey` przez RSA-OAEP SHA-256,
4. zwraca `EncryptionData`.

## `prepareInvoicePayload(invoiceXml, cipherKey, cipherIv)`

- `invoiceXml` musi być `Buffer`;
- szyfrowanie XML: AES-256-CBC;
- hash oryginału i hash zaszyfrowanej zawartości liczone osobno;
- `encryptedInvoiceContent` zwracany jako Base64.

Przykład:

```ts
import { CryptographyService } from "ksef-client-typescript";

const key = CryptographyService.generateAesKey();
const iv = CryptographyService.generateIv();
const invoiceXml = Buffer.from("<Invoice>...</Invoice>", "utf8");

const payload = CryptographyService.prepareInvoicePayload(invoiceXml, key, iv);
console.log(payload.invoiceHash, payload.encryptedInvoiceSize);
```
