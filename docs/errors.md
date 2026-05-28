# Błędy, rate limits i retry

SDK mapuje błędy HTTP i błędy walidacji na dedykowane klasy wyjątków.

## Typy błędów

| Klasa                     | Kiedy występuje                                                                 | Najważniejsze pola                            |
| ------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------- |
| `KsefError`               | Bazowy błąd SDK (np. błędy workflow).                                           | `message`                                     |
| `KsefHttpError`           | Odpowiedź HTTP >= 400 bez JSON.                                                 | `statusCode`, `responseBody`, `problem?`      |
| `KsefApiError`            | Odpowiedź HTTP >= 400 z JSON.                                                   | `statusCode`, `responseBody`, `problem?`      |
| `KsefRateLimitError`      | `429 Too Many Requests`.                                                        | `statusCode`, `responseBody`, `retryAfter`, `retryAfterSeconds`, `problem?` |
| `KsefAuthStatusError`     | Specjalny przypadek `460` (status auth wskazujący m.in. zawieszony certyfikat). | `statusCode`, `responseBody`, `statusDetails` |
| `KsefSessionExpiredError` | Brak tokena dostępowego lub nieudane odświeżenie sesji.                         | `message`                                     |
| `KsefValidationError`     | Błąd lokalnej walidacji danych wejściowych.                                     | `message`, `details`                          |

## `problem` i KSeF API `2.6.0`

Przy odpowiedziach JSON SDK próbuje zmapować `error.problem` do jednego z modeli:

- `BadRequestProblemDetails` dla `400 application/problem+json`
- `UnauthorizedProblemDetails` dla `401 application/problem+json`
- `ForbiddenProblemDetails` dla `403 application/problem+json`
- `GoneProblemDetails` dla `410 application/problem+json`
- `TooManyRequestsProblemDetails` albo legacy `TooManyRequestsResponse` dla `429`
- `ExceptionResponse` dla klasycznego formatu błędu KSeF
- fallback `UnknownApiProblem`, gdy JSON nie pasuje do znanego modelu

Mapowanie do konkretnego typed modelu następuje tylko wtedy, gdy payload spełnia wymagane pola
kontraktu `ksef-docs 2.6.0`. Przy częściowym albo niepoprawnym `problem+json` SDK zachowuje
`responseBody`, a `error.problem` przechodzi do `UnknownApiProblem`.

`410 Gone` może pojawić się po wygaśnięciu retencji technicznych statusów operacji asynchronicznych
np. dla `GET /auth/{referenceNumber}` albo `GET /invoices/exports/{referenceNumber}`.

Bogatszy format `application/problem+json` dla `400` i `429` jest opcjonalny i można go włączyć
przez globalny nagłówek klienta:

```ts
const client = new KsefClient({
  environment: "DEMO",
  headers: {
    "X-Error-Format": "problem-details",
  },
});
```

## Przykład obsługi `429` i `Retry-After`

```ts
import { KsefRateLimitError } from "ksef-client-typescript";

try {
  await client.invoices.queryInvoiceMetadata({ subjectType: "Subject1" });
} catch (error) {
  if (error instanceof KsefRateLimitError) {
    console.error("Przekroczono limit. Retry-After:", error.retryAfter);
    console.error("Retry-After (sekundy):", error.retryAfterSeconds);
  }
  throw error;
}
```

## Przykład obsługi `problem+json`

```ts
import { KsefApiError } from "ksef-client-typescript";

try {
  await client.invoices.queryInvoiceMetadata({ subjectType: "Subject1" });
} catch (error) {
  if (error instanceof KsefApiError && error.problem) {
    console.error(error.problem.title, error.problem.detail);
  }
  throw error;
}
```

## Przykład obsługi `460` (status auth)

```ts
import { KsefAuthStatusError } from "ksef-client-typescript";

try {
  await client.workflows.auth.authenticateWithXadesSignature({
    signedXml: "<AuthTokenRequest>...signed...</AuthTokenRequest>",
  });
} catch (error) {
  if (error instanceof KsefAuthStatusError && error.statusCode === 460) {
    console.error("Uwierzytelnianie odrzucone:", error.statusDetails);
  }
  throw error;
}
```

## Przykład obsługi wygaśnięcia sesji

```ts
import { KsefSessionExpiredError } from "ksef-client-typescript";

try {
  await client.invoices.queryInvoiceMetadata({
    subjectType: "Subject1",
    dateRange: { dateType: "Issue", from: "2025-01-01", to: "2025-01-31" },
  });
} catch (error) {
  if (error instanceof KsefSessionExpiredError) {
    console.error("Sesja wygasła. Wymagane ponowne uwierzytelnienie.");
  }
  throw error;
}
```

## Automatyczny retry na `429`

Domyślnie biblioteka ponawia żądania tylko dla metod idempotentnych:

- `GET`
- `PUT`
- `DELETE`

Mechanizm retry:

- respektuje nagłówek `Retry-After` (sekundy lub data HTTP),
- gdy nagłówek nie występuje, stosuje opóźnienie wykładnicze z jitterem,
- ogranicza opóźnienie przez `maxRetryDelayMs`.

Konfiguracja globalna znajduje się w `KsefClientOptions`:

- `retryOn429`
- `maxRetryAttempts`
- `maxRetryDelayMs`

## Błędy workflow uwierzytelniania

`AuthCoordinator` może zgłosić `KsefError`, jeżeli status uwierzytelniania zakończy się kodem innym niż oczekiwany (`100` w trakcie lub `200` po sukcesie), albo gdy przekroczony zostanie limit prób odpytywania.
