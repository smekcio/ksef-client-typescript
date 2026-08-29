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
4. Domyslna polityka integralnosci eksportu zostala zaostrzona:
   - `requireExportPartHash` domyslnie jest `true`,
   - opcja `verifyHashes` pozostaje wspierana jako alias legacy.
5. Dodano dedykowanego klienta `client.lighthouse` i wsparcie CLI dla `--lighthouse-env`.
6. KSeF API 2.7.1:
   - `listInvoices` używa `POST /collective-identifiers/invoices` i przyjmuje `string | string[]` (1–10 IZ),
   - zakres query/export to 100 dni UTC (wcześniej 3 miesiące),
   - `generate` odrzuca mniej niż 2 faktury przed HTTP,
   - workflow eksportu wymaga `package.compressionType` i obsługuje TarGz.

## Wplyw na developerow

- Zmiany w `open-api.json` moga wymagac aktualizacji `openapi.generated.ts`.
- Pull request nie przejdzie `validate-models.yml`, jesli plik generowany nie jest aktualny.
- `openapi.generated.ts` traktuj jako artefakt build, nie jako recznie utrzymywany kod.
- Eksporty, ktore nie zwracaja `encryptedPartHash`, beda teraz domyslnie odrzucane przez workflow.
- Integracje monitorujace Latarnie moga przejsc z recznego `fetch` na `client.lighthouse`.

## Zalecana sekwencja aktualizacji

```bash
npm ci
npm run generate:openapi-models -- --openapi ../ksef-api/open-api.json --output src/types/openapi.generated.ts
node scripts/check-openapi-coverage.mjs --openapi ../ksef-api/open-api.json --src src/api
npm run lint
npm run typecheck
```

## Zmiana hash policy w eksporcie

Przed zmiana:

```ts
await client.workflows.exports.downloadAndProcessPackage(status, encryptionData, {
  verifyHashes: false,
});
```

Po zmianie (jawne wylaczenie walidacji):

```ts
await client.workflows.exports.downloadAndProcessPackage(status, encryptionData, {
  requireExportPartHash: false,
});
```

## Typowe symptomy niezgodnosci modeli

- `git diff` pokazuje zmiany w `src/types/openapi.generated.ts` po lokalnym generowaniu.
- `check-openapi-coverage` raportuje brakujace endpointy po zmianach specyfikacji.
- Workflow `validate-models.yml` pada mimo braku zmian w runtime SDK.
