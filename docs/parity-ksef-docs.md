# Parity report: `ksef-client-typescript` vs `ksef-docs` (OpenAPI) + `ksef-client-python` docs

Data analizy: 2026-02-16

## Zakres i zrodla

- API kontrakt: `ksef-docs/open-api.json` (`51fb808`, 2026-01-16).
- Ostatnie zmiany docs API: `ksef-docs/api-changelog.md` (2.0.1 + 2.0.0).
- Referencyjna jakosc dokumentacji: `ksef-client-python/docs/*`.
- Implementacja TS: `src/api/*`, `src/types/*`, `src/services/*`, `docs/*`.

## Najwazniejszy wynik

- Pokrycie endpointow OpenAPI: `75/75`.
- Braki endpointowe: `0`.
- Dodatkowe endpointy w TS: `POST /testdata/context/block`, `POST /testdata/context/unblock`.
- Parity parametrow query/header dla kluczowych endpointow zostalo dopiete (sessions, tokens, permissions query, certificates query, peppol query).

## Ostatnie zmiany w `ksef-docs` (co bylo istotne dla SDK)

W ostatnich commitach i changelogu 2.0.1/2.0.0 najwazniejsze dla klientow SDK byly:

1. Uprawnienia:
   - korekty logiki i opisow dla `POST /permissions/query/personal/grants`,
   - doprecyzowania `InternalId` i ograniczen dlugosci.
2. Invoices query/export:
   - doprecyzowanie walidacji okna 3 miesiecy dla `dateRange`.
3. Wysylka:
   - doprecyzowanie walidacji NIP (glownie produkcja).
4. OpenAPI:
   - porzadkowe zmiany opisow i przykladow.

Na poziomie powierzchni endpointow (paths/methods) nie wykryto nowych brakujacych operacji wzgledem poprzedniej rewizji.

## Analiza modul po module (funkcjonalnosc)

| Modul | Endpointy w OpenAPI | Pokrycie TS | Status |
| --- | --- | --- | --- |
| Auth | 9 | 9/9 | OK |
| Active sessions | 3 (w `auth/sessions*`) | 3/3 | OK |
| Sessions | 13 | 13/13 | OK |
| Invoices | 4 | 4/4 | OK |
| Permissions | 18 | 18/18 | OK |
| Certificates | 7 | 7/7 | OK |
| Tokens | 4 | 4/4 | OK |
| Limits + rate-limits | 3 (+ testdata limits) | 3/3 (+ testdata) | OK |
| Testdata | 15 | 15/15 (+2 extra) | OK |
| Security | 1 | 1/1 | OK |
| Peppol | 1 | 1/1 | OK |

## Analiza modul po module (jakosc API i szczegoly)

1. Auth
   - Jest: challenge, KSeF token auth, XAdES auth, status, redeem, refresh.
   - Jest: `verifyCertificateChain` i `enforceXadesCompliance`.
   - Status: OK.
2. Sessions
   - Jest: pelny flow online i batch + statusy/UPO + failed invoices.
   - Jest: wymagane `sessionType` oraz filtry + `x-continuation-token`.
   - Status: OK.
3. Invoices
   - Jest: get XML, metadata query, export, export status.
   - Jest: lokalna walidacja `dateRange` (3 miesiace).
   - Jest: `includeMetadata` dla export (`X-KSeF-Feature: include-metadata`).
   - Status: OK.
4. Permissions
   - Jest: grant/revoke/query/status operation.
   - Dopiete: paginacja query (`pageOffset`, `pageSize`) jako query parametry HTTP.
   - Status: OK.
5. Certificates
   - Jest: limits, enrollment data, create enrollment, status, query, retrieve, revoke.
   - Dopiete: `queryCertificates(request, pageOffset?, pageSize?)`.
   - Status: OK.
6. Tokens
   - Jest: list/generate/get/revoke.
   - Dopiete: filtrowanie `status` jako tablica + continuation header.
   - Status: OK.
7. Peppol
   - Jest: `queryProviders`.
   - Dopiete: paginacja `pageOffset/pageSize`.
   - Status: OK.
8. Testdata
   - Jest: attachment, permissions, person, subject, rate limits, context limits.
   - Jest dodatkowo: `context/block` i `context/unblock`.
   - Status: OK.
9. Limits/security/active-sessions
   - Pelne pokrycie endpointow i podstawowych parametrow.
   - Status: OK.

## Parity dokumentacji TS vs Python (jakosc i przyklady)

Po aktualizacji dokumentacji TS:

- API docs maja rozszerzone opisy praktyczne i scenariusze.
- Ujednolicono i poprawiono sygnatury metod zgodnie z aktualnym kodem.
- Dodano/rozszerzono przyklady m.in. dla:
  - sessions (wymagane `sessionType`, pagination, online/batch),
  - tokens (`status` jako tablica),
  - certificates (enrollment + polling + query/revoke),
  - permissions (pagination query params),
  - limits (override + restore),
  - security (dobor certyfikatow i szyfrowanie tokena),
  - peppol (pagination).

Status parity dokumentacji: OK dla glownej powierzchni API i workflow.

## Co nadal jest do dopracowania (jako dlug techniczny)

1. Typowanie modeli:
   - duza czesc odpowiedzi/requestow nadal ma typ `JsonObject` (forward-compatible, ale mniej precyzyjne dla DX).
2. Automatyczna walidacja zgodnosci z OpenAPI:
   - warto dodac CI check porownujacy OpenAPI z sygnaturami TS (np. snapshot/contract test).
3. Dodatkowe przyklady executable:
   - mozna rozszerzyc `docs/examples` o gotowe skrypty integracyjne dla permissions/certificates/peppol.

## Wnioski koncowe

- Funkcjonalnosci z `ksef-docs` sa zaimplementowane w TS (pokrycie endpointow: 75/75).
- TS zostal wyrownany do Python SDK tam, gdzie brakowalo szczegolow parametrow (`permissions`, `certificates`, `peppol`).
- Dokumentacja TS zostala doprowadzona do poziomu praktycznego (wiecej scenariuszy, wiecej przykladow, lepsza spojnosc sygnatur z kodem).
