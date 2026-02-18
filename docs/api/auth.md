# Uwierzytelnianie (`auth`)

Niskopoziomowy klient dla endpointów `/auth/*`.

## Dostępne metody

- `getChallenge()`
- `authenticateWithKsefToken(request)`
- `authenticateWithXadesSignature(signedXml, verifyCertificateChain?, enforceXadesCompliance?)`
- `getAuthStatus(referenceNumber, authenticationToken)`
- `redeemToken(authenticationToken)`
- `refreshAccessToken(refreshToken)`

## Najważniejsze informacje

- `getAuthStatus(...)` przyjmuje `authenticationToken` z odpowiedzi inicjalizującej, a nie `accessToken`.
- `refreshAccessToken(...)` wysyła `refreshToken` jako token autoryzacji.
- Odpowiedź statusowa zawiera `authenticationMethodInfo`; pole `authenticationMethod` jest przestarzałe.
- Dla `authenticateWithXadesSignature(..., ..., true)` SDK ustawia nagłówek `X-KSeF-Feature: enforce-xades-compliance` (potwierdzone testami jednostkowymi).
- Operacje na aktywnych sesjach uwierzytelnienia (listowanie i wycofywanie sesji) są opisane w [`active-sessions.md`](active-sessions.md): `listActiveSessions(...)`, `revokeCurrentSession()`, `revokeSession(referenceNumber)`.

## Przykłady TypeScript

### Odczyt `authenticationMethodInfo` w statusie autoryzacji

```ts
const status = await client.auth.getAuthStatus(referenceNumber, authenticationToken);

console.log(status.authenticationMethodInfo.category); // XadesSignature | NationalNode | Token | Other
console.log(status.authenticationMethodInfo.code);
console.log(status.authenticationMethodInfo.displayName);
```

### Ręczny przepływ autoryzacji tokenem KSeF (thin client)

```ts
import { CryptographyService } from "ksef-client-typescript";

const challenge = await client.auth.getChallenge();
const timestampMs =
  challenge.timestampMs ??
  (Number.isNaN(Date.parse(challenge.timestamp)) ? Date.now() : Date.parse(challenge.timestamp));

const certs = await client.security.getPublicKeyCertificates();
const tokenCert = certs.find((c) => c.usage.includes("KsefTokenEncryption"));
if (!tokenCert) {
  throw new Error("Brak certyfikatu z usage=KsefTokenEncryption");
}

const encryptedToken = CryptographyService.encryptKsefToken(
  process.env.KSEF_TOKEN!,
  timestampMs,
  tokenCert.certificate,
);

const init = await client.auth.authenticateWithKsefToken({
  challenge: challenge.challenge,
  contextIdentifier: { type: "Nip", value: "5265877635" },
  encryptedToken,
});

let authorized = false;
for (let attempt = 0; attempt < 60; attempt += 1) {
  const polled = await client.auth.getAuthStatus(
    init.referenceNumber,
    init.authenticationToken.token,
  );
  if (polled.status.code === 200) {
    authorized = true;
    break;
  }
  if (polled.status.code !== 100) {
    throw new Error(`Autoryzacja nieudana: ${polled.status.code} ${polled.status.description}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

if (!authorized) {
  throw new Error("Przekroczono czas oczekiwania na zakończenie autoryzacji.");
}

const tokens = await client.auth.redeemToken(init.authenticationToken.token);
client.authManager.setTokens(tokens);
```

### XAdES z kontrolą łańcucha certyfikatów i wymuszeniem zgodności

```ts
const init = await client.auth.authenticateWithXadesSignature(
  "<AuthTokenRequest>...podpisany XML...</AuthTokenRequest>",
  true,
  true,
);

const status = await client.auth.getAuthStatus(
  init.referenceNumber,
  init.authenticationToken.token,
);

console.log(status.status.code, status.authenticationMethodInfo.code);
```

### Odświeżenie `accessToken`

```ts
const refreshed = await client.auth.refreshAccessToken(currentRefreshToken);
client.authManager.setAccessToken(refreshed.accessToken.token, refreshed.accessToken.validUntil);
```

### Obsługa `KsefAuthStatusError` (np. HTTP 460)

```ts
import { KsefAuthStatusError } from "ksef-client-typescript";

try {
  await client.auth.getChallenge();
} catch (error) {
  if (error instanceof KsefAuthStatusError) {
    console.error("Kod HTTP:", error.statusCode);
    console.error("Szczegóły statusu:", error.statusDetails);
  }
  throw error;
}
```

### Workflow autoryzacji (zalecane w aplikacji)

```ts
const tokens = await client.workflows.auth.authenticateWithKsefToken({
  token: process.env.KSEF_TOKEN!,
  context: { type: "Nip", value: "5265877635" },
  pollIntervalMs: 2000,
  maxAttempts: 90,
});

client.authManager.setTokens(tokens);
```
