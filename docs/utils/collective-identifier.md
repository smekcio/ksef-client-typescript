# Identyfikator zbiorczy

Walidator formatu IZ (`NIP-IZYYYYMM-HEX12-CRC8`) oraz helpery fail-fast zgodne z KSeF API 2.7.1.

## API

- `validateCollectiveIdentifierNumber(value): CollectiveIdentifierValidationResult`
- `isValidCollectiveIdentifierNumber(value): boolean`
- `requireCollectiveIdentifierNumber(value): string`
- `requirePageSize(value, maximum?)`
- `requireInvoicesQueryIdentifiers(value)`
- `requireQueryDateRange(dateFrom, dateTo)`
- `expandQueryDateBound(value, endOfDay)`
- `makeCollectiveIdentifierInvoice(ksefNumber, options?)`
- `requireGenerateInvoices(invoices)`

Stałe: `MIN_INVOICES_PER_IDENTIFIER` (2), `MAX_INVOICES_PER_IDENTIFIER` (500),
`MAX_IDENTIFIERS_PER_INVOICE` (132), `MAX_IDENTIFIERS_PER_INVOICES_QUERY` (10),
`MAX_QUERY_RANGE_DAYS` (100), `PAGE_SIZE_MIN` / `PAGE_SIZE_MAX` / `PAGE_SIZE_INVOICES_MAX`,
`COLLECTIVE_IDENTIFIER_EXCEPTION_CODES`.

`requireCollectiveIdentifierNumber` zwraca wartość albo rzuca `Error`. Używane przez
`client.collectiveIdentifiers.listInvoices`.

## Przykład

```ts
import { validateCollectiveIdentifierNumber } from "ksef-client";

const result = validateCollectiveIdentifierNumber("5265877635-IZ202508-0100001AF629-FC");
console.log(result.isValid);
```
