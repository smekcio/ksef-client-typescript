# Auth

Thin client dla `/auth/*`.

## Metody

- `getChallenge()`
- `authenticateWithKsefToken(request)`
- `authenticateWithXadesSignature(signedXml, verifyCertificateChain?)`
- `getAuthStatus(referenceNumber, authenticationToken)`
- `redeemToken(authenticationToken)`
- `refreshAccessToken(refreshToken)`

## Przyklad: token KSeF

```ts
const challenge = await client.auth.getChallenge();
const init = await client.auth.authenticateWithKsefToken({
  challenge: challenge.challenge,
  contextIdentifier: { type: "Nip", value: "5265877635" },
  encryptedToken: "BASE64",
});

const status = await client.auth.getAuthStatus(
  init.referenceNumber,
  init.authenticationToken.token,
);

const tokens = await client.auth.redeemToken(init.authenticationToken.token);
```
