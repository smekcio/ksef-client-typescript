# CLI i narzedzia projektowe

Repozytorium zawiera CLI `ksef-ts` oraz narzedzia npm/Node.js wspierajace codzienna prace developerska i CI.

## Najwazniejsze komendy

Instalacja:

```bash
npm ci
```

Generowanie modeli OpenAPI:

```bash
npm run generate:openapi-models -- --openapi ../ksef-api/open-api.json --output src/types/openapi.generated.ts
```

Kontrola pokrycia endpointow TypeScript vs OpenAPI:

```bash
node scripts/check-openapi-coverage.mjs --openapi ../ksef-api/open-api.json --src src/api
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

## Identyfikatory zbiorcze (`iz`)

```text
ksef-ts iz generate --ksef-number TEXT [--ksef-number TEXT] [--from-file PATH]
ksef-ts iz query --from YYYY-MM-DD --to YYYY-MM-DD [--iz TEXT] [--page-size 10] [--all]
ksef-ts iz invoices --iz TEXT [--iz TEXT] [--page-size 10] [--all]
ksef-ts iz by-ksef --ksef-number TEXT [--page-size 10] [--all]
```

`generate` wymaga co najmniej dwóch numerów KSeF. `query` i `invoices` bez `--all`
zwracają `continuationToken` do kolejnej strony. Zakres `--from/--to` nie może
przekraczać 100 dni. Jedno żądanie `iz invoices` przyjmuje maksymalnie 10 numerów IZ.

## Session checkpoints (resume)

CLI wspiera zapisywalne checkpointy sesji online/batch:

```bash
# online
node dist/cli/index.js --json session online open --id demo-online --form-code FA3
node dist/cli/index.js --json session online send --id demo-online --invoice-file ./invoice.xml --wait-status
node dist/cli/index.js --json session online close --id demo-online

# batch
node dist/cli/index.js --json session batch open --id demo-batch --dir ./invoices
node dist/cli/index.js --json session batch upload --id demo-batch --parallelism 4
node dist/cli/index.js --json session batch close --id demo-batch --wait-status --wait-upo
```

Operacje na zapisanych checkpointach:

```bash
node dist/cli/index.js --json session list
node dist/cli/index.js --json session show --id demo-online
node dist/cli/index.js --json session status --id demo-online --invoice-ref INV-1
node dist/cli/index.js --json session export --id demo-online --out ./artifacts/
node dist/cli/index.js --json session import --in ./artifacts/session-demo-online.json --id demo-online-copy
node dist/cli/index.js --json session drop --id demo-online
```

## Wskazowki

- `src/types/openapi.generated.ts` jest plikiem generowanym; nie edytuj go recznie.
- Workflow `validate-models.yml` sprawdza, czy wygenerowany plik jest zgodny z aktualnym `open-api.json`.
