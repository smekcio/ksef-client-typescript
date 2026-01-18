# Bledy i retry

SDK mapuje bledy HTTP na klasy domenowe:

- `KsefError` - bazowy blad SDK
- `KsefHttpError` - bledy HTTP bez JSON
- `KsefApiError` - bledy API z JSON
- `KsefRateLimitError` - 429 + `retryAfter`
- `KsefSessionExpiredError` - brak lub wygasly token
- `KsefValidationError` - bledy walidacji danych wejsciowych

## Przyklad obslugi 429

```ts
import { KsefRateLimitError } from "ksef-client-typescript";

try {
  await client.invoices.queryInvoiceMetadata({ subjectType: "Subject1" });
} catch (err) {
  if (err instanceof KsefRateLimitError) {
    console.error("Retry-After:", err.retryAfter);
  }
  throw err;
}
```

## Automatyczny retry na 429

Domyslnie SDK automatycznie ponawia requesty na `429` tylko dla metod idempotentnych (`GET`, `PUT`, `DELETE`), z uwzglednieniem naglowka `Retry-After` (jesli jest).

Mozesz to wylaczyc globalnie przez `retryOn429: false` w `KsefClientOptions`.

## Auth i wygasniecie sesji

Gdy odswiezenie tokena sie nie uda, SDK rzuci `KsefSessionExpiredError`. W takim
przypadku nalezy ponownie wykonac `KsefClient.connect(...)`.
