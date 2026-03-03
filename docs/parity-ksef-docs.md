# Raport parity: `ksef-client-typescript` vs `ksef-docs`

Data analizy: **2026-03-03**

## Zakres i źródła

- Kontrakt API: `ksef-docs/open-api.json` (`2.2.0`)
- Changelog: `ksef-docs/api-changelog.md` (wersje `2.1.0`, `2.1.1`, `2.1.2`, `2.2.0`)
- Implementacja TypeScript: `src/api/*`, `src/types/*`, `src/services/*`, `src/client/*`, `docs/*`
- Weryfikacja dodatkowa: `temp/openapi-test-v2.json` (`https://api-test.ksef.mf.gov.pl/docs/v2/openapi.json`)

## Wynik ogólny

- Pokrycie endpointów OpenAPI: **78/78**
- Braki endpointowe: **0**
- Nadmiarowe endpointy po stronie TS: **0**
- Zgodność kontraktu `ksef-docs` vs `api-test`: **zgodna** (po odfiltrowaniu opisów/metadanych)

## Zmiany uwzględnione po stronie SDK (2.2.0)

1. Uprawnienia (`/permissions/*`)
   - dodano obsługę endpointu `POST /permissions/query/entities/grants`;
   - dodano ścisłe typy request/response:
     - `EntityPermissionsQueryRequest`,
     - `QueryEntityPermissionsResponse`,
     - `EntityPermissionItem` i typy pomocnicze.

2. Uwierzytelnianie (`/auth/challenge`)
   - model `AuthChallengeResponse` obejmuje `clientIp`;
   - `timestampMs` jest traktowany jako pole wymagane zgodnie z kontraktem 2.2.0.

3. Obsługa błędów HTTP
   - parser odpowiedzi w `HttpClient` obsługuje `application/problem+json` oraz inne media type kończące się na `+json`;
   - błędy `401/403` w formacie Problem Details są mapowane do `KsefApiError` z payloadem JSON.

4. Modele OpenAPI
   - odświeżono `src/types/openapi.generated.ts` do aktualnej specyfikacji;
   - zaktualizowano licznik schematów i typy dodane w 2.2.0.

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

Dokumentacja TS została uaktualniona do spójności z KSeF `2.2.0`:

- deklaracje kompatybilności API (`v2.2.0`) w README i docs,
- opis nowej metody `queryEntitiesGrants(...)` w dokumentacji `permissions`,
- doprecyzowanie, że challenge auth zawiera `clientIp`,
- zaktualizowany raport parity i wyniki walidacji.
