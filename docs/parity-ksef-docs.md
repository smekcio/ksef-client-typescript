# Raport parity: `ksef-client-typescript` vs `ksef-api`

Data analizy: **2026-08-29**

## Zakres i źródła

- Kontrakt API: [CIRFMF/ksef-api](https://github.com/CIRFMF/ksef-api) `open-api.json` (`2.7.1`)
- Changelog: [api-changelog.md](https://github.com/CIRFMF/ksef-api/blob/main/api-changelog.md) (wersje do `2.7.1`)
- Implementacja TypeScript: `src/api/*`, `src/types/*`, `src/services/*`, `src/client/*`, `docs/*`
- Weryfikacja dodatkowa: `https://api-test.ksef.mf.gov.pl/docs/v2/openapi.json`

## Wynik ogólny

- Pokrycie endpointów OpenAPI: **83/83** (78 ścieżek; IZ invoices jako POST)
- Braki endpointowe: **0**
- Nadmiarowe endpointy po stronie TS: **0**
- Zgodność kontraktu `ksef-api` vs `api-test`: **zgodna**

## Zmiany uwzględnione po stronie SDK (2.7.1)

1. Modele OpenAPI
   - odświeżono `src/types/openapi.generated.ts` do kontraktu `ksef-api 2.7.1`;
   - `CollectiveIdentifierInvoicesQueryRequest`, `package.compressionType`,
     `SetSessionLimitsRequest.collectiveIdentifier.maxInvoices`.

2. Identyfikatory zbiorcze
   - `listInvoices` → `POST /collective-identifiers/invoices` (1–10 numerów, `pageSize` 10–500);
   - helpery `generateForKsefNumbers`, `queryByCreatedRange`, `iterQuery` / `iterInvoices` / `iterByKsefNumber`;
   - fail-fast: min. 2 faktury, unikalne numery KSeF, zakres dat 100 dni, limity `pageSize`.

3. Faktury i eksport
   - lokalna walidacja `dateRange` 100 dni UTC;
   - workflow eksportu rozpakowuje ZIP albo TarGz według `package.compressionType`.

4. Ostrzeżenia systemowe
   - `KsefClientOptions.systemWarningHandler` dla nagłówka `X-System-Warning`;
   - na TEST treść można wymusić przez `X-Test-System-Warning`.

5. Dokumentacja SDK
   - deklaracje kompatybilności API w README i `docs/*` wskazują `v2.7.1`;
   - CLI `ksef-ts iz`.

## Weryfikacja parity endpointów

| Moduł                  | OpenAPI               | TS SDK           | Status |
| ---------------------- | --------------------- | ---------------- | ------ |
| Auth                   | 9                     | 9/9              | OK     |
| Active Sessions        | 3                     | 3/3              | OK     |
| Sessions               | 13                    | 13/13            | OK     |
| Invoices               | 4                     | 4/4              | OK     |
| Permissions            | 19                    | 19/19            | OK     |
| Certificates           | 7                     | 7/7              | OK     |
| Tokens                 | 4                     | 4/4              | OK     |
| Collective identifiers | 4                     | 4/4              | OK     |
| Limits + rate-limits   | 3 (+ testdata limits) | 3/3 (+ testdata) | OK     |
| Testdata               | 18                    | 18/18            | OK     |
| Security               | 1                     | 1/1              | OK     |
| Peppol                 | 1                     | 1/1              | OK     |

## Parity dokumentacji

Dokumentacja TS została uaktualniona do spójności z KSeF `2.7.1`:

- deklaracje kompatybilności API (`v2.7.1`) w README i docs,
- dokumentacja `collectiveIdentifiers`, helperów IZ oraz CLI `ksef-ts iz`,
- zakres query/export 100 dni UTC i `package.compressionType`,
- zaktualizowany raport parity.
