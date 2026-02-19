# Raport parity: `ksef-client-typescript` vs `ksef-docs`

Data analizy: **2026-02-19**

## Zakres i źródła

- Kontrakt API: `ksef-docs/open-api.json` (`d9be9d7`, `2.1.2`)
- Changelog: `ksef-docs/api-changelog.md` (wersje `2.1.0`, `2.1.1`, `2.1.2`)
- Implementacja TypeScript: `src/api/*`, `src/types/*`, `src/services/*`, `src/xml/*`, `docs/*`

## Wynik ogólny

- Pokrycie endpointów OpenAPI: **77/77**
- Braki endpointowe: **0**
- Nadmiarowe endpointy po stronie TS: **0**

## Zmiany uwzględnione po stronie SDK (2.1.2)

1. Tokeny KSeF (`/tokens`)
   - modele `GenerateTokenRequest`, `GenerateTokenResponse`, `QueryTokensResponse`,
     `TokenStatusResponse` są jawnie typowane;
   - `TokenPermissionType` obejmuje aktualny katalog uprawnień:
     `InvoiceRead`, `InvoiceWrite`, `CredentialsRead`, `CredentialsManage`,
     `SubunitManage`, `EnforcementOperations`, `Introspection`;
   - zachowano aliasy kompatybilności (`KsefTokenRequest`, `KsefTokenResponse`,
     `KsefTokensListResponse`).

2. Uwierzytelnianie (`authenticationMethodInfo`)
   - odpowiedzi `auth.getAuthStatus(...)` i `activeSessions.listActiveSessions(...)`
     są normalizowane defensywnie;
   - jeśli API zwróci starszy kształt odpowiedzi (brak lub niepełny
     `authenticationMethodInfo`), SDK uzupełnia pola na podstawie
     `authenticationMethod`.

3. Schemy RR/FA/PEF dla sesji
   - `formCode` dla sesji jest jawnie typowany:
     - online: `FA (2)`, `FA (3)`, `PEF (3)`, `PEF_KOR (3)`, `FA_RR (1)`,
     - batch: `FA (2)`, `FA (3)`, `FA_RR (1)`;
   - ograniczenie jawnie udokumentowane: `buildFakturaXml` generuje wyłącznie FA2/FA3;
     dla RR należy przekazać gotowy XML (`string`/`Buffer`).

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

## Parity dokumentacji

Dokumentacja TS została uaktualniona do spójności z KSeF `2.1.2`:

- deklaracje kompatybilności API (`v2.1.2`) w README i docs,
- opis aktualnych `TokenPermissionType` wraz z przykładami tokenów,
- doprecyzowanie normalizacji `authenticationMethodInfo`,
- aktualizacja informacji o schematach RR/FA/PEF i ograniczeniach buildera XML.
