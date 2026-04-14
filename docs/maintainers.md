# Maintainers Guide

Ten dokument zbiera informacje operacyjne dla utrzymania repozytorium.
README pozostaje zwięzły i skupiony na użytkowniku SDK.

## Wymagania

- Node.js `>= 20`
- `npm`
- lokalne repo `ksef-docs` (do kontroli zgodności OpenAPI)

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

Aktualny target kompatybilności repo: **KSeF API `2.4.0`**.

Regeneracja modeli:

```bash
npm run generate:openapi-models -- --openapi ../ksef-docs/open-api.json --output src/types/openapi.generated.ts
```

Kontrola pokrycia endpointów:

```bash
npm run check:openapi-coverage -- --openapi ../ksef-docs/open-api.json --src src/api
```

## Workflowy GitHub Actions

- `CI` (`.github/workflows/ci.yml`) - lint, typecheck, testy i coverage.
- `E2E Auth Flows` (`.github/workflows/e2e-token.yml`) - scenariusze token/XAdES dla `TEST` i `DEMO`.
- `Validate API Compliance` (`.github/workflows/validate-openapi.yml`) - kontrola pokrycia endpointów.
- `Validate OpenAPI Models` (`.github/workflows/validate-models.yml`) - pobranie OpenAPI, regeneracja modeli i diff.
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
