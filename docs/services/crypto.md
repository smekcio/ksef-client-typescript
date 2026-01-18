# CryptographyService

Klasa pomocnicza dla szyfrowania i hashy.

## Przyklad

```ts
import { CryptographyService } from "ksef-client-typescript";

const key = CryptographyService.generateAesKey();
const iv = CryptographyService.generateIv();

const encrypted = CryptographyService.encryptAes256Cbc(Buffer.from("test"), key, iv);

const decrypted = CryptographyService.decryptAes256Cbc(encrypted, key, iv);
```

## Dodatkowe metody

- `sha256Base64`, `sha256Base64Url`
- `encryptKsefToken` (RSA lub EC)
- `getEncryptionData` (AES + RSA-OAEP)
- `prepareInvoicePayload`
