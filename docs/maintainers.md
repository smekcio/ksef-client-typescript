# Maintainers Guide

Ten dokument zbiera informacje operacyjne dla utrzymania repozytorium.
README pozostaje zwięzły i skupiony na użytkowniku SDK.

## Wymagania

- Node.js `>= 22.19.0`
- `npm`
- snapshot kontraktu `specs/ksef-openapi.snapshot.json` jest dołączony do repo

Runtime produkcyjny wymaga Node.js 22.19.0 lub nowszego. `.nvmrc` wskazuje
Node.js 24 do pracy lokalnej i publikacji. CI testuje dokładną wersję minimalną
22.19.0 oraz linie 24 i 26 dla każdego PR.

`npm run typecheck` używa natywnego kompilatora TypeScript 7 (`typescript7`).
TypeScript 6 (`typescript`) dostarcza API wymagane przez aktualny
`typescript-eslint` oraz `tsup` do lintowania i generowania deklaracji.
`tsup` ustawia `ignoreDeprecations: "6.0"` tylko dla deklaracji, ponieważ jego
wewnętrzny generator nadal ustawia przestarzałe `baseUrl`.

## Szybki flow lokalny

Instalacja:

```bash
npm ci
```

Kontrola jakości:

```bash
npm run lint
npm run typecheck
npm run test:coverage
```

Uwaga: CI wymaga 100% coverage (statement/branch/function/line).

## Kontrola zgodności z OpenAPI

Aktualny target kompatybilności repo: **KSeF API `2.8.1`**.

Źródło kontraktu: [CIRFMF/ksef-api](https://github.com/CIRFMF/ksef-api) (`open-api.json`)
lub live TEST: `https://api-test.ksef.mf.gov.pl/docs/v2/openapi.json`.

Regeneracja modeli:

```bash
npm run generate:openapi-models -- --openapi specs/ksef-openapi.snapshot.json --output src/types/openapi.generated.ts
```

Kontrola pokrycia endpointów:

```bash
npm run check:openapi-coverage -- --openapi specs/ksef-openapi.snapshot.json --src src/api
```

## Workflowy GitHub Actions

- `CI` (`.github/workflows/ci.yml`) - lint, typecheck, testy i coverage.
- `E2E Auth Flows` (`.github/workflows/e2e-token.yml`) - scenariusze token/XAdES dla `TEST` i `DEMO`.
- `Validate API Compliance` (`.github/workflows/validate-openapi.yml`) - kontrola pokrycia endpointów.
- `Validate OpenAPI Models` (`.github/workflows/validate-models.yml`) - regeneracja modeli ze snapshotu i diff.
- `Release Please` (`.github/workflows/release-please.yml`) - automatyzacja wersjonowania i changeloga.
- `Publish to npm` (`.github/workflows/publish-npm.yml`) - publikacja paczki po opublikowaniu GitHub Release.
- `Publish to GitHub Packages` (`.github/workflows/publish-github-packages.yml`) - publikacja scoped package po opublikowaniu GitHub Release.
- `Release Published Validation` (`.github/workflows/release-published.yml`) - walidacja opublikowanego release.

## Release

- Używaj Conventional Commits (`feat:`, `fix:`, `chore:` itd.).
- `Release Please` aktualizuje wersję i `CHANGELOG.md` automatycznie.
- Po publikacji GitHub Release workflowy `publish-npm.yml` i `publish-github-packages.yml` publikują odpowiednio do npm i GitHub Packages.
- npm publish musi odbywać się z `publish-npm.yml`, bo to ten workflow jest powiązany z npm Trusted Publishing.
- Przed merge release PR upewnij się, że `main` zawiera wszystkie wymagane commity funkcjonalne.

## Bezpieczeństwo

- Nie loguj tokenów, kluczy prywatnych i danych certyfikatów.
- Przekazuj sekrety przez zmienne środowiskowe/GitHub Secrets.
- Nie commituj plików `.pem`, `.p12`, `.pfx`.
