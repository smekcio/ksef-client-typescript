# CLI i narzedzia projektowe

Repozytorium zawiera CLI `ksef-ts` oraz narzedzia npm/Node.js wspierajace codzienna prace developerska i CI.

## Najwazniejsze komendy

Instalacja:

```bash
npm ci
```

Generowanie modeli OpenAPI:

```bash
npm run generate:openapi-models -- --openapi ../ksef-docs/open-api.json --output src/types/openapi.generated.ts
```

Kontrola pokrycia endpointow TypeScript vs OpenAPI:

```bash
node scripts/check-openapi-coverage.mjs --openapi ../ksef-docs/open-api.json --src src/api
```

Pelna lokalna kontrola jak w CI:

```bash
npm run lint
npm run typecheck
npm test
```

Podstawowe uzycie CLI:

```bash
node dist/cli/index.js --help
```

## Wskazowki

- `src/types/openapi.generated.ts` jest plikiem generowanym; nie edytuj go recznie.
- Workflow `validate-models.yml` sprawdza, czy wygenerowany plik jest zgodny z aktualnym `open-api.json`.
