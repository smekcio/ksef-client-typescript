# Raport parity: `ksef-client-typescript` vs `ksef-docs`

Data analizy: **2026-04-13**

## Zakres i źródła

- Kontrakt API: `ksef-docs/open-api.json` (`2.4.0`)
- Changelog: `ksef-docs/api-changelog.md` (wersje do `2.4.0`)
- Implementacja TypeScript: `src/api/*`, `src/types/*`, `src/services/*`, `src/client/*`, `docs/*`
- Weryfikacja dodatkowa: `temp/openapi-test-v2.json` (`https://api-test.ksef.mf.gov.pl/docs/v2/openapi.json`)

## Wynik ogólny

- Pokrycie endpointów OpenAPI: **78/78**
- Braki endpointowe: **0**
- Nadmiarowe endpointy po stronie TS: **0**
- Zgodność kontraktu `ksef-docs` vs `api-test`: **zgodna** (po odfiltrowaniu opisów/metadanych)

## Zmiany uwzględnione po stronie SDK (2.4.0)

1. Modele OpenAPI
   - odświeżono `src/types/openapi.generated.ts` do `ksef-docs 2.4.0`;
   - liczba schematów wzrosła do `287`;
   - modele obejmują nowe typy `ApiError`, `BadRequestProblemDetails`, `GoneProblemDetails`,
     `TooManyRequestsProblemDetails` oraz pola `timestamp` w `ForbiddenProblemDetails`
     i `UnauthorizedProblemDetails`.

2. Runtime błędów HTTP
   - `HttpClient` rozpoznaje `application/problem+json` dla `400`, `401`, `403`, `410`, `429`;
   - błędy `KsefApiError` i `KsefRateLimitError` udostępniają `problem` z rozpoznanym payloadem;
   - `KsefRateLimitError` udostępnia również `retryAfterSeconds`, obok dotychczasowego `retryAfter`.

3. Tokeny KSeF
   - kontrakt i dokumentacja odzwierciedlają semantykę `2.4.0` dla operacji na bieżącym tokenie
     uwierzytelniającym przy `GET /tokens`, `GET /tokens/{referenceNumber}` i
     `DELETE /tokens/{referenceNumber}`.

4. Dokumentacja SDK
   - deklaracje kompatybilności API w README i `docs/*` wskazują `v2.4.0`;
   - dokumentacja opisuje `X-Error-Format: problem-details`, `410 Gone` oraz zaktualizowane
     zachowanie endpointów tokenów.

## Weryfikacja parity endpointów

| Moduł                | OpenAPI               | TS SDK           | Status |
| -------------------- | --------------------- | ---------------- | ------ |
| Auth                 | 9                     | 9/9              | OK     |
| Active Sessions      | 3                     | 3/3              | OK     |
| Sessions             | 13                    | 13/13            | OK     |
| Invoices             | 4                     | 4/4              | OK     |
| Permissions          | 19                    | 19/19            | OK     |
| Certificates         | 7                     | 7/7              | OK     |
| Tokens               | 4                     | 4/4              | OK     |
| Limits + rate-limits | 3 (+ testdata limits) | 3/3 (+ testdata) | OK     |
| Testdata             | 17                    | 17/17            | OK     |
| Security             | 1                     | 1/1              | OK     |
| Peppol               | 1                     | 1/1              | OK     |

## Parity dokumentacji

Dokumentacja TS została uaktualniona do spójności z KSeF `2.4.0`:

- deklaracje kompatybilności API (`v2.4.0`) w README i docs,
- opis `problem+json` i `X-Error-Format` w dokumentacji błędów i konfiguracji,
- opis self-token semantics w dokumentacji `tokens`,
- zaktualizowany raport parity i wyniki walidacji.
