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
- Typ `TokenPermissionType` (używany m.in. w `GenerateTokenRequest.permissions`) obejmuje:
  `"InvoiceRead"`, `"InvoiceWrite"`, `"CredentialsRead"`, `"CredentialsManage"`, `"SubunitManage"`,
  `"EnforcementOperations"`, `"Introspection"`.
- Stronicowanie listy tokenów działa przez nagłówek `x-continuation-token` (potwierdzone testami jednostkowymi).
- Od KSeF API `2.4.0` `GET /tokens` może zwrócić także informacje o tokenie użytym do bieżącego
  uwierzytelnienia, nawet bez `CredentialsManage` / `CredentialsRead`.
- Od KSeF API `2.4.0` `GET /tokens/{referenceNumber}` oraz `DELETE /tokens/{referenceNumber}`
  mogą dotyczyć bieżącego tokenu uwierzytelniającego również bez dodatkowego uprawnienia
  `CredentialsManage`.

## Przykłady TypeScript

### Generowanie tokena i odczyt statusu

```ts
import { GenerateTokenRequest } from "ksef-client-typescript";

const createRequest: GenerateTokenRequest = {
  description: "Token operatora do odczytu i introspekcji",
  permissions: ["InvoiceRead", "Introspection"],
};

const created = await client.tokens.generateToken(createRequest);
const referenceNumber = created.referenceNumber;

const status = await client.tokens.getToken(referenceNumber);
console.log(status.status, status.requestedPermissions);
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

if (firstPage.continuationToken) {
  const nextPage = await client.tokens.listTokens(
    {
      pageSize: 25,
      status: ["Active"],
    },
    firstPage.continuationToken,
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
