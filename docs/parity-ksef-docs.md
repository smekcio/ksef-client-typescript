# Raport parity: `ksef-client-typescript` vs `ksef-api`

Data analizy: **2026-07-27**

## Zakres i źródła

- Kontrakt API: [CIRFMF/ksef-api](https://github.com/CIRFMF/ksef-api) `open-api.json` (`2.7.0`)
- Changelog: [api-changelog.md](https://github.com/CIRFMF/ksef-api/blob/main/api-changelog.md) (wersje do `2.7.0`)
- Implementacja TypeScript: `src/api/*`, `src/types/*`, `src/services/*`, `src/client/*`, `docs/*`
- Weryfikacja dodatkowa: `https://api-test.ksef.mf.gov.pl/docs/v2/openapi.json`

## Wynik ogólny

- Pokrycie endpointów OpenAPI: **83/83** (78 ścieżek; nowe operacje IZ + testdata certificate)
- Braki endpointowe: **0**
- Nadmiarowe endpointy po stronie TS: **0**
- Zgodność kontraktu `ksef-api` vs `api-test`: **zgodna**

## Zmiany uwzględnione po stronie SDK (2.7.0)

1. Modele OpenAPI
   - odświeżono `src/types/openapi.generated.ts` do kontraktu `ksef-api 2.7.0`;
   - liczba schematów: `302`;
   - nowe typy IZ (`GenerateCollectiveIdentifier*`, `CollectiveIdentifiers*`) oraz
     `TestDataUpdateCertificateRequest`;
   - `CollectiveIdentifierManage` w enumach uprawnień / tokenów.

2. Identyfikatory zbiorcze
   - `client.collectiveIdentifiers` (`generate`, `query`, `listInvoices`, `listByKsefNumber`);
   - walidacja path params IZ i numeru KSeF przed wysłaniem żądania.

3. Testdata
   - `client.testdata.updateCertificate(serialNumber, { validTo })` →
     `PUT /testdata/certificates/{serialNumber}`;
   - walidacja numeru seryjnego certyfikatu (`^[0-9A-F]{16}$`).

4. Dokumentacja SDK
   - deklaracje kompatybilności API w README i `docs/*` wskazują `v2.7.0`;
   - źródło kontraktu CI: `CIRFMF/ksef-api` (zamiast historycznego `ksef-docs`).

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

Dokumentacja TS została uaktualniona do spójności z KSeF `2.7.0`:

- deklaracje kompatybilności API (`v2.7.0`) w README i docs,
- dokumentacja `collectiveIdentifiers` oraz `testdata.updateCertificate`,
- utils dla IZ i numeru seryjnego certyfikatu,
- zaktualizowany raport parity.
