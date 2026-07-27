# Identyfikator zbiorczy

Walidator formatu IZ (`NIP-IZYYYYMM-HEX12-CRC8`), zgodny z dokumentacją KSeF API 2.7.0.

## API

- `validateCollectiveIdentifierNumber(value): CollectiveIdentifierValidationResult`
- `isValidCollectiveIdentifierNumber(value): boolean`
- `requireCollectiveIdentifierNumber(value): string`

`requireCollectiveIdentifierNumber` zwraca wartość albo rzuca `Error`. Używane przez
`client.collectiveIdentifiers.listInvoices`.

## Przykład

```ts
import { validateCollectiveIdentifierNumber } from "ksef-client";

const result = validateCollectiveIdentifierNumber("5265877635-IZ202508-0100001AF629-FC");
console.log(result.isValid);
```
