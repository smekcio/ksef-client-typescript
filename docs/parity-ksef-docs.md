# Raport parity: `ksef-client-typescript` vs `ksef-docs` + `ksef-client-python`

Data analizy: **2026-02-17**

## Zakres i źródła

- Kontrakt API: `ksef-docs/open-api.json` (`0261ff1`, tag `2.1.1`)
- Changelog: `ksef-docs/api-changelog.md` (wersje `2.1.0`, `2.1.1`)
- Wzorzec implementacyjny i dokumentacyjny: `ksef-client-python` (`4eaf3e1`)
- Implementacja TypeScript: `src/api/*`, `src/types/*`, `src/services/*`, `src/utils/*`, `src/xml/*`, `docs/*`, `.github/workflows/*`

## Wynik ogólny

- Pokrycie endpointów OpenAPI: **77/77**
- Braki endpointowe: **0**
- Nadmiarowe endpointy po stronie TS: **0**

## Zmiany po stronie `ksef-docs` (2.1.x)

1. Dodane endpointy testowe kontekstu:
   - `POST /testdata/context/block`
   - `POST /testdata/context/unblock`
2. Rozszerzenie modeli auth:
   - nowe pole `authenticationMethodInfo` (`category`, `code`, `displayName`)
   - oznaczenie `authenticationMethodInfo` jako wymagane m.in. dla:
     - `GET /auth/{referenceNumber}`
     - `GET /auth/sessions`
3. XAdES:
   - wsparcie nagłówka `X-KSeF-Feature: enforce-xades-compliance` (DEMO/PRD)

## Weryfikacja parity endpointów

| Moduł                | OpenAPI               | TS SDK           | Status |
| -------------------- | --------------------- | ---------------- | ------ |
| Auth                 | 9                     | 9/9              | OK     |
| Active Sessions      | 3                     | 3/3              | OK     |
| Sessions             | 13                    | 13/13            | OK     |
| Invoices             | 4                     | 4/4              | OK     |
| Permissions          | 18                    | 18/18            | OK     |
| Certificates         | 7                     | 7/7              | OK     |
| Tokens               | 4                     | 4/4              | OK     |
| Limits + rate-limits | 3 (+ testdata limits) | 3/3 (+ testdata) | OK     |
| Testdata             | 17                    | 17/17            | OK     |
| Security             | 1                     | 1/1              | OK     |
| Peppol               | 1                     | 1/1              | OK     |

## Parity funkcjonalny (TS vs Python)

1. Uwierzytelnianie:
   - `enforceXadesCompliance` wspierane w thin client i workflow
   - `authenticationMethodInfo` obsługiwane jako podstawowa część modelu statusu
2. Testdata:
   - `blockContext` i `unblockContext` zaimplementowane oraz udokumentowane
3. Typowanie:
   - dopięte typy odpowiedzi aktywnych sesji (`AuthenticationListResponse`)
4. CI/E2E:
   - flow tokenowy: TEST + DEMO
   - flow XAdES: TEST + DEMO (sekrety cert/key jako RAW lub Base64, guard dla fork PR)

## Parity dokumentacji

Dokumentacja TS została zaktualizowana do spójności z Python SDK i KSeF `2.1.1`:

- jawna deklaracja kompatybilności API (`2.1.1`)
- opisy i przykłady `authenticationMethodInfo.category` (w tym `NationalNode`)
- doprecyzowanie `activeSessions` na odpowiedzi typowane zamiast surowego `JsonObject`
- utrzymane scenariusze i przykłady dla tokenów oraz XAdES
- uzupełnione opisy modułów `utils` i `xml` zgodnie z aktualnym API TS

## Dalszy rozwój

1. Zwiększenie precyzji typów dla pozostałych obszarów `JsonObject` (`tokens`, `permissions`, `certificates`)
2. Automatyczna walidacja kontraktu OpenAPI w CI (detekcja dryfu przed release)
3. Rozszerzenie executable examples o scenariusze certyfikatów i uprawnień
