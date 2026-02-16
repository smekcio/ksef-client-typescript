# Auth

Thin client dla `/auth/*`.

## Metody

- `getChallenge()`
- `authenticateWithKsefToken(request)`
- `authenticateWithXadesSignature(signedXml, verifyCertificateChain?, enforceXadesCompliance?)`
- `getAuthStatus(referenceNumber, authenticationToken)`
- `redeemToken(authenticationToken)`
- `refreshAccessToken(refreshToken)`

## Co warto wiedziec

- `getAuthStatus(...)` przyjmuje `authenticationToken` (z odpowiedzi init), nie `accessToken`.
- `redeemToken(...)` jest jednorazowe dla danego `authenticationToken`.
- `refreshAccessToken(...)` wysyla `refreshToken` jako `Authorization: Bearer <refreshToken>`.
- Odpowiedz statusowa zawiera `authenticationMethodInfo`; pole `authenticationMethod` jest deprecated.

## `authenticationMethodInfo` vs `authenticationMethod`

```ts
const status = await client.auth.getAuthStatus(referenceNumber, authenticationToken);

console.log(status.authenticationMethodInfo.category);
console.log(status.authenticationMethodInfo.code);      // np. "ksefToken" / "xades"
console.log(status.authenticationMethodInfo.displayName);

// Deprecated - utrzymane tylko dla kompatybilnosci:
console.log(status.authenticationMethod);
```

## `enforceXadesCompliance`

Przy `authenticateWithXadesSignature(..., ..., true)` SDK dodaje naglowek:

- `X-KSeF-Feature: enforce-xades-compliance`

To jest wlaczane tylko gdy trzeci argument ma wartosc `true`.

## Przyklad 1: pelny flow token KSeF (thin client)

```ts
const challenge = await client.auth.getChallenge();

const init = await client.auth.authenticateWithKsefToken({
  challenge: challenge.challenge,
  contextIdentifier: { type: "Nip", value: "5265877635" },
  encryptedToken: "BASE64_TOKEN_PAYLOAD",
});

let done = false;
for (let attempt = 0; attempt < 60; attempt += 1) {
  const status = await client.auth.getAuthStatus(
    init.referenceNumber,
    init.authenticationToken.token,
  );

  if (status.status.code === 200) {
    done = true;
    break;
  }
  if (status.status.code !== 100) {
    throw new Error(`Auth failed: ${status.status.code} ${status.status.description}`);
  }

  await new Promise((resolve) => setTimeout(resolve, 2000));
}

if (!done) {
  throw new Error("Auth timeout");
}

const tokens = await client.auth.redeemToken(init.authenticationToken.token);
client.authManager.setTokens(tokens);
```

## Przyklad 2: XAdES z `verifyCertificateChain` i `enforceXadesCompliance`

```ts
const init = await client.auth.authenticateWithXadesSignature(
  "<AuthTokenRequest>...signed xml...</AuthTokenRequest>",
  true,
  true,
);

const status = await client.auth.getAuthStatus(
  init.referenceNumber,
  init.authenticationToken.token,
);

console.log(status.status.code, status.authenticationMethodInfo.code);
```

## Przyklad 3: refresh access token

```ts
const refreshed = await client.auth.refreshAccessToken(currentRefreshToken);
client.authManager.setAccessToken(refreshed.accessToken.token, refreshed.accessToken.validUntil);
```

## Przyklad 4: obsluga `KsefAuthStatusError` (np. HTTP 460)

```ts
import { KsefAuthStatusError } from "ksef-client-typescript";

try {
  await client.workflows.auth.authenticateWithXadesSignature({
    signedXml: "<AuthTokenRequest>...signed xml...</AuthTokenRequest>",
    enforceXadesCompliance: true,
  });
} catch (error) {
  if (error instanceof KsefAuthStatusError) {
    console.error("HTTP:", error.statusCode);
    console.error("Details:", error.statusDetails);
  }
  throw error;
}
```

## Przyklad 5: workflow auth (zalecane w aplikacjach)

```ts
const tokens = await client.workflows.auth.authenticateWithKsefToken({
  token: process.env.KSEF_TOKEN!,
  context: { type: "Nip", value: "5265877635" },
  pollIntervalMs: 2000,
  maxAttempts: 90,
});

client.authManager.setTokens(tokens);
```
