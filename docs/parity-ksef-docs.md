# Parity report: `ksef-client-typescript` vs `ksef-docs` + `ksef-client-python`

Data analizy: 2026-02-17

## Zakres i zrodla

- Kontrakt API: `ksef-docs/open-api.json` (`0261ff1`, tag `2.1.1`).
- Changelog: `ksef-docs/api-changelog.md` (2.1.0, 2.1.1).
- Wzorzec implementacyjny i dokumentacyjny: `ksef-client-python` (`4eaf3e1`).
- Implementacja TS: `src/api/*`, `src/types/*`, `src/services/*`, `docs/*`, `.github/workflows/*`.

## Najwazniejszy wynik

- Pokrycie endpointow OpenAPI: **77/77**.
- Braki endpointowe: **0**.
- Nadmiarowe endpointy po stronie TS: **0**.

## Co zmienilo sie w `ksef-docs` (2.1.x)

1. Dodane endpointy testdata:
   - `POST /testdata/context/block`
   - `POST /testdata/context/unblock`
2. Rozszerzenie modeli auth:
   - nowe `authenticationMethodInfo` (`category`, `code`, `displayName`),
   - `authenticationMethodInfo` oznaczone jako required m.in. dla:
     - `GET /auth/{referenceNumber}`,
     - `GET /auth/sessions`.
3. Dla XAdES:
   - wsparcie naglowka `X-KSeF-Feature: enforce-xades-compliance` (DEMO/PRD).

## Weryfikacja parity endpointow (moduly)

| Modul | OpenAPI | TS SDK | Status |
| --- | --- | --- | --- |
| Auth | 9 | 9/9 | OK |
| Active Sessions | 3 | 3/3 | OK |
| Sessions | 13 | 13/13 | OK |
| Invoices | 4 | 4/4 | OK |
| Permissions | 18 | 18/18 | OK |
| Certificates | 7 | 7/7 | OK |
| Tokens | 4 | 4/4 | OK |
| Limits + rate-limits | 3 (+ testdata limits) | 3/3 (+ testdata) | OK |
| Testdata | 17 | 17/17 | OK |
| Security | 1 | 1/1 | OK |
| Peppol | 1 | 1/1 | OK |

## Parity funkcjonalny (TS vs Python)

1. Auth:
   - `enforceXadesCompliance` wspierane w thin client i workflow.
   - `authenticationMethodInfo` traktowane jako glowny model statusu.
2. Testdata:
   - `blockContext` / `unblockContext` zaimplementowane i udokumentowane.
3. Typowanie:
   - dopiete typy odpowiedzi aktywnych sesji (`AuthenticationListResponse`).
4. CI/E2E:
   - token flow: TEST + DEMO,
   - XAdES flow: TEST + DEMO (sekrety cert/key raw lub Base64, guard dla fork PR).

## Parity dokumentacji

Dokumentacja TS zostala zaktualizowana tak, by odpowiadala Python SDK i KSeF 2.1.1:

- jawna informacja o kompatybilnosci API (`2.1.1`),
- opisy i przyklady dla `authenticationMethodInfo.category` (w tym `NationalNode`),
- doprecyzowanie `activeSessions` na typowane odpowiedzi zamiast surowego `JsonObject`,
- utrzymane przykłady i workflowy dla token i XAdES.

## Obszary dalszego rozwoju

1. Wieksza precyzja typow dla pozostalych `JsonObject` (tokens/permissions/certificates).
2. Automatyczna walidacja kontraktu OpenAPI w CI (detekcja dryfu przed release).
3. Rozszerzenie executable examples o scenariusze certyfikaty/uprawnienia.
