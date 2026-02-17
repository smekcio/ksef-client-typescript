# Tokeny (`tokens`)

Niskopoziomowy klient dla endpointów `/tokens/*`.

Token KSeF (systemowy) to inny artefakt niż sesyjne `accessToken` i `refreshToken`.
Token KSeF możesz wykorzystać np. w autoryzacji przez `authenticateWithKsefToken(...)`.

## Dostępne metody

- `listTokens(params?, continuationToken?)`
- `generateToken(request)`
- `getToken(referenceNumber)`
- `revokeToken(referenceNumber)`

## Najważniejsze informacje

- `listTokens(...)` obsługuje filtry: `status`, `description`, `authorIdentifier`, `authorIdentifierType`, `pageSize`.
- Dostępne wartości `status`: `"Pending"`, `"Active"`, `"Revoking"`, `"Revoked"`, `"Failed"`.
- Dostępne wartości `authorIdentifierType`: `"Nip"`, `"Pesel"`, `"Fingerprint"`.
- Stronicowanie listy tokenów działa przez nagłówek `x-continuation-token` (potwierdzone testami jednostkowymi).

## Przykłady TypeScript

### Generowanie tokena i odczyt statusu

```ts
import { KsefTokenRequest } from "ksef-client-typescript";

const createRequest: KsefTokenRequest = {
  // Uzupełnij zgodnie z kontraktem OpenAPI dla POST /tokens.
};

const created = await client.tokens.generateToken(createRequest);
const referenceNumber = String(
  (created as { referenceNumber?: string }).referenceNumber ?? "",
);

const status = await client.tokens.getToken(referenceNumber);
console.log(status);
```

### Listowanie tokenów z continuation token

```ts
const firstPage = await client.tokens.listTokens({
  pageSize: 25,
  status: ["Active", "Revoking"],
  description: "operator token",
  authorIdentifier: "5265877635",
  authorIdentifierType: "Nip",
});

const continuation =
  typeof firstPage === "object" && firstPage !== null
    ? (firstPage.continuationToken as string | undefined)
    : undefined;

if (continuation) {
  const nextPage = await client.tokens.listTokens(
    {
      pageSize: 25,
      status: ["Active"],
    },
    continuation,
  );
  console.log(nextPage);
}
```

### Cofnięcie tokena

```ts
await client.tokens.revokeToken("TOKEN_REFERENCE_NUMBER");
```

### `KsefClient.connect` z tokenem KSeF

```ts
import { KsefClient } from "ksef-client-typescript";

const client = await KsefClient.connect({
  environment: "DEMO",
  token: process.env.KSEF_TOKEN!,
  context: { type: "Nip", value: "5265877635" },
});

console.log(await client.authManager.getAccessToken());
```

### Workflow autoryzacji tokenowej

```ts
const tokens = await client.workflows.auth.authenticateWithKsefToken({
  token: process.env.KSEF_TOKEN!,
  context: { type: "Nip", value: "5265877635" },
});

client.authManager.setTokens(tokens);
```
