# Raport parity: `ksef-client-typescript` vs `ksef-docs`

Data analizy: **2026-03-19**

## Zakres i źródła

- Kontrakt API: `ksef-docs/open-api.json` (`2.3.0`)
- Changelog: `ksef-docs/api-changelog.md` (wersje do `2.3.0`)
- Implementacja TypeScript: `src/api/*`, `src/types/*`, `src/services/*`, `src/client/*`, `docs/*`
- Weryfikacja dodatkowa: `temp/openapi-test-v2.json` (`https://api-test.ksef.mf.gov.pl/docs/v2/openapi.json`)

## Wynik ogólny

- Pokrycie endpointów OpenAPI: **78/78**
- Braki endpointowe: **0**
- Nadmiarowe endpointy po stronie TS: **0**
- Zgodność kontraktu `ksef-docs` vs `api-test`: **zgodna** (po odfiltrowaniu opisów/metadanych)

## Zmiany uwzględnione po stronie SDK (2.3.0)

1. Eksport faktur (`/invoices/exports`)
   - `InvoiceExportRequest` wspiera `onlyMetadata`;
   - klient i workflow eksportu wysyłają `onlyMetadata` w body requestu zgodnie z kontraktem 2.3.0;
   - stary alias `includeMetadata` jest utrzymany wyłącznie jako warstwa kompatybilności po stronie SDK.

2. Form codes `FA_RR`
   - modele OpenAPI obejmują `InvoiceQueryFormType = "FA_RR" | "FA" | "PEF" | "RR"`;
   - typy sesji online/batch wspierają aktualny wariant `FA_RR (1) / 1-1E / FA_RR`;
   - CLI mapuje skrót `FARR1` do bieżącego wariantu `1-1E / FA_RR`.

3. Modele OpenAPI
   - odświeżono `src/types/openapi.generated.ts` do `ksef-docs 2.3.0`;
   - zaktualizowano liczbę schematów i eksportowane typy pomocnicze zgodnie z najnowszym kontraktem.

4. Dokumentacja SDK
   - deklaracje kompatybilności API w README i `docs/*` wskazują `v2.3.0`;
   - dokumentacja `invoices`, workflowów eksportu oraz sesji opisuje `onlyMetadata` i aktualne `FA_RR`.

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

Dokumentacja TS została uaktualniona do spójności z KSeF `2.3.0`:

- deklaracje kompatybilności API (`v2.3.0`) w README i docs,
- opis `onlyMetadata` w dokumentacji `invoices` i workflowu eksportu,
- aktualne wskazówki dla `FA_RR (1)` w wersji `1-1E`,
- zaktualizowany raport parity i wyniki walidacji.
