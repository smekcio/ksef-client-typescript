# Numer seryjny certyfikatu

Walidator zgodny z OpenAPI: `^[0-9A-F]{16}$`.

## API

- `validateCertificateSerialNumber(value): CertificateSerialValidationResult`
- `isValidCertificateSerialNumber(value): boolean`
- `requireCertificateSerialNumber(value): string`

`requireCertificateSerialNumber` zwraca wartość albo rzuca `Error`. Używane przez
`client.testdata.updateCertificate`.

## Przykład

```ts
import { requireCertificateSerialNumber } from "ksef-client";

const serial = requireCertificateSerialNumber("0123456789ABCDEF");
```
