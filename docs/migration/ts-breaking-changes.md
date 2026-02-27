# TypeScript breaking changes - migracja

Ten dokument opisuje zmiany procesowe po rozszerzeniu SDK i automatyzacji modeli OpenAPI.

## Co sie zmienilo

1. Dodano generator modeli OpenAPI: `scripts/generate-openapi-models.mjs`.
2. Dodano plik generowany: `src/types/openapi.generated.ts`.
3. Dodano workflow `validate-models.yml`, ktory:
   - pobiera aktualne `open-api.json`,
   - regeneruje modele,
   - sprawdza `git diff`,
   - uruchamia kontrole pokrycia endpointow.

## Wplyw na developerow

- Zmiany w `open-api.json` moga wymagac aktualizacji `openapi.generated.ts`.
- Pull request nie przejdzie `validate-models.yml`, jesli plik generowany nie jest aktualny.
- `openapi.generated.ts` traktuj jako artefakt build, nie jako recznie utrzymywany kod.

## Zalecana sekwencja aktualizacji

```bash
npm ci
npm run generate:openapi-models -- --openapi ../ksef-docs/open-api.json --output src/types/openapi.generated.ts
node scripts/check-openapi-coverage.mjs --openapi ../ksef-docs/open-api.json --src src/api
npm run lint
npm run typecheck
```

## Typowe symptomy niezgodnosci modeli

- `git diff` pokazuje zmiany w `src/types/openapi.generated.ts` po lokalnym generowaniu.
- `check-openapi-coverage` raportuje brakujace endpointy po zmianach specyfikacji.
- Workflow `validate-models.yml` pada mimo braku zmian w runtime SDK.
