# Tokens

Thin client dla `/tokens/*`.

Tokeny KSeF (systemowe) to inna kategoria niz `accessToken`/`refreshToken`.
Moga byc uzywane np. w workflow `authenticateWithKsefToken(...)`.

## Metody

- `listTokens(params?, continuationToken?)`
- `generateToken(request)`
- `getToken(referenceNumber)`
- `revokeToken(referenceNumber)`

## `listTokens(params?, continuationToken?)`

Obslugiwane filtry:
- `status`: tablica statusow (`"Pending"`, `"Active"`, `"Revoking"`, `"Revoked"`, `"Failed"`)
- `description`
- `authorIdentifier`
- `authorIdentifierType` (`"Nip"`, `"Pesel"`, `"Fingerprint"`)
- `pageSize`

## Przyklad 1: generowanie tokena + status

```ts
const createRequest = {
  // Przykladowy payload - dopasuj do kontraktu POST /tokens.
  description: "integration token",
  contextIdentifier: { type: "Nip", value: "5265877635" },
};

const created = await client.tokens.generateToken(createRequest);
const referenceNumber = String(created.referenceNumber ?? "");

const status = await client.tokens.getToken(referenceNumber);
console.log(status);
```

## Przyklad 2: listowanie tokenow z continuation token

```ts
const firstPage = await client.tokens.listTokens(
  {
    pageSize: 20,
    status: ["Active", "Pending"],
  },
  undefined,
);

const continuation =
  typeof firstPage === "object" && firstPage !== null
    ? (firstPage.continuationToken as string | undefined)
    : undefined;

if (continuation) {
  const nextPage = await client.tokens.listTokens(
    {
      pageSize: 20,
      status: ["Active"],
    },
    continuation,
  );
  console.log(nextPage);
}
```

## Przyklad 3: revoke token

```ts
await client.tokens.revokeToken("TOKEN_REFERENCE_NUMBER");
```

## Przyklad 4: token jako wejscie do `KsefClient.connect`

```ts
import { KsefClient } from "ksef-client-typescript";

const client = await KsefClient.connect({
  environment: "DEMO",
  token: process.env.KSEF_TOKEN!,
  context: { type: "Nip", value: "5265877635" },
});

console.log("Connected with access token valid until:", await client.authManager.getAccessToken());
```

## Przyklad 5: osobny flow auth z tokenem

```ts
const tokens = await client.workflows.auth.authenticateWithKsefToken({
  token: process.env.KSEF_TOKEN!,
  context: { type: "Nip", value: "5265877635" },
});

client.authManager.setTokens(tokens);
```
