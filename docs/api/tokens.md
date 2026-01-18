# Tokens

Thin client dla `/tokens/*`.

## Metody

- `listTokens(params?, continuationToken?)`
- `generateToken(request)`
- `getToken(referenceNumber)`
- `revokeToken(referenceNumber)`

## Przyklad

```ts
const token = await client.tokens.generateToken({
  tokenName: "demo",
  tokenContext: { type: "Nip", value: "5265877635" },
});

const status = await client.tokens.getToken(token.referenceNumber);
```
