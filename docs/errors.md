# Bledy i retry

SDK mapuje bledy HTTP na klasy domenowe:

- `KsefError` - bazowy blad SDK
- `KsefHttpError` - bledy HTTP bez JSON
- `KsefApiError` - bledy API z JSON
- `KsefRateLimitError` - 429 + `retryAfter`
- `KsefAuthStatusError` - specjalny blad auth status (np. 460, zawieszony certyfikat)
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

## Przyklad obslugi 460: certyfikat zawieszony

```ts
import { KsefAuthStatusError } from "ksef-client-typescript";

try {
  await client.workflows.auth.authenticateWithXadesSignature({
    signedXml: "<AuthTokenRequest>...signed...</AuthTokenRequest>",
  });
} catch (err) {
  if (err instanceof KsefAuthStatusError && err.statusCode === 460) {
    const suspended = err.statusDetails?.some((item) =>
      item.toLowerCase().includes("certyfikat zawiesz"),
    );

    if (suspended) {
      console.error("Uwierzytelnienie odrzucone: Certyfikat zawieszony.");
      // np. fallback na inny certyfikat lub przerwanie procesu
      throw err;
    }
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
