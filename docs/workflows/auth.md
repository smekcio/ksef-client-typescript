# Workflow: uwierzytelnianie (token KSeF / XAdES)

Workflow auth zwraca `accessToken` i `refreshToken`, a potem mozesz ustawic je przez `client.authManager.setTokens(...)`.

## Metody workflow

- `client.workflows.auth.authenticateWithKsefToken(options)`
- `client.workflows.auth.authenticateWithXadesSignature(options)`
- `client.workflows.auth.authenticateWithCertificate(options)`

## Co warto wiedziec

- `authenticateWithXadesSignature(...)` i `authenticateWithCertificate(...)` obsluguja `enforceXadesCompliance`.
- Przy pollingu statusu uzywaj `authenticationMethodInfo`; `authenticationMethod` jest deprecated.
- `authenticationMethodInfo.category` moze byc rowniez `NationalNode` (API 2.1.x).
- Dla bledow auth status (np. HTTP `460` z zawieszonym certyfikatem) moze zostac rzucony `KsefAuthStatusError`.

## Wariant A: token KSeF (zalecany start)

```ts
import { KsefClient } from "ksef-client-typescript";

const client = new KsefClient({ environment: "DEMO" });

const tokens = await client.workflows.auth.authenticateWithKsefToken({
  token: process.env.KSEF_TOKEN!,
  context: { type: "Nip", value: "5265877635" },
  encryptionMethod: "rsa", // albo "ec"
  ecOutputFormat: "java",  // istotne dla "ec"
  pollIntervalMs: 2000,
  maxAttempts: 90,
});

client.authManager.setTokens(tokens);
```

## Wariant B: XAdES - gotowy signed XML

```ts
const tokens = await client.workflows.auth.authenticateWithXadesSignature({
  signedXml: "<AuthTokenRequest>...signed...</AuthTokenRequest>",
  verifyCertificateChain: true,
  enforceXadesCompliance: true,
  pollIntervalMs: 2000,
  maxAttempts: 90,
});

client.authManager.setTokens(tokens);
```

`enforceXadesCompliance: true` ustawia naglowek `X-KSeF-Feature: enforce-xades-compliance`.

## Wariant C: XAdES - certyfikat + klucz (PEM)

```ts
import { XadesKeyPair } from "ksef-client-typescript";

const keyPair = XadesKeyPair.fromPem({
  certificatePem: process.env.KSEF_XADES_CERT_PEM!,
  privateKeyPem: process.env.KSEF_XADES_KEY_PEM!,
  // privateKeyPassword: "...", // opcjonalnie
});

const tokens = await client.workflows.auth.authenticateWithCertificate({
  keyPair,
  context: { type: "Nip", value: "5265877635" },
  subjectIdentifierType: "certificateSubject",
  signaturePackaging: "enveloped", // albo "enveloping"
  verifyCertificateChain: true,
  enforceXadesCompliance: true,
});

client.authManager.setTokens(tokens);
```

## Wariant D: XAdES - kontener PKCS#12 (`.p12`/`.pfx`)

```ts
import { XadesKeyPair } from "ksef-client-typescript";

const keyPair = await XadesKeyPair.fromPkcs12File({
  pkcs12Path: "./cert.p12",
  pkcs12Password: process.env.KSEF_XADES_PKCS12_PASSWORD,
});

const tokens = await client.workflows.auth.authenticateWithCertificate({
  keyPair,
  context: { type: "Nip", value: "5265877635" },
});

client.authManager.setTokens(tokens);
```

## Wariant E: manualny polling statusu z `authenticationMethodInfo`

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

console.log(status.authenticationMethodInfo.code);
console.log(status.authenticationMethod); // deprecated
```

## Wariant F: obsluga `KsefAuthStatusError`

```ts
import { KsefAuthStatusError } from "ksef-client-typescript";

try {
  await client.workflows.auth.authenticateWithXadesSignature({
    signedXml: "<AuthTokenRequest>...signed...</AuthTokenRequest>",
    enforceXadesCompliance: true,
  });
} catch (error) {
  if (error instanceof KsefAuthStatusError) {
    console.error(error.statusCode, error.statusDetails);
    // np. fallback na inny certyfikat
  }
  throw error;
}
```

## Budowanie XML do podpisu

```ts
import { buildAuthTokenRequestXml } from "ksef-client-typescript";

const xml = buildAuthTokenRequestXml({
  challenge: "...",
  contextIdentifierType: "Nip",
  contextIdentifierValue: "5265877635",
  subjectIdentifierType: "certificateSubject",
  authorizationPolicyXml: null,
});

console.log(xml);
```
