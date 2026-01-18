# AuthCoordinator i authXml

## AuthCoordinator

`AuthCoordinator` realizuje proces uwierzytelniania (token KSeF lub XAdES).

```ts
const tokens = await client.workflows.auth.authenticateWithKsefToken({
  token: process.env.KSEF_TOKEN!,
  context: { type: "Nip", value: "5265877635" },
  encryptionMethod: "rsa",
  pollIntervalMs: 2000,
  maxAttempts: 60,
});
```

## authenticateWithXadesSignature

```ts
const result = await client.workflows.auth.authenticateWithXadesSignature({
  signedXml: "<AuthTokenRequest>...signed...</AuthTokenRequest>",
  verifyCertificateChain: true,
});
```

## authenticateWithCertificate

SDK potrafi zbudowac `AuthTokenRequest` i podpisac go XAdES (enveloped), a nastepnie wyslac do `/auth/xades-signature`.

```ts
import { XadesKeyPair } from "ksef-client-typescript";

const keyPair = XadesKeyPair.fromPem({
  // Zawartosc PEM (nie sciezka do pliku)
  certificatePem: process.env.KSEF_XADES_CERT_PEM!,
  privateKeyPem: process.env.KSEF_XADES_KEY_PEM!,
});

const result = await client.workflows.auth.authenticateWithCertificate({
  keyPair,
  context: { type: "Nip", value: "5265877635" },
  subjectIdentifierType: "certificateSubject",
  signaturePackaging: "enveloped", // albo "enveloping"
  verifyCertificateChain: true,
});
```

## authXml

`buildAuthTokenRequestXml(...)` pomaga zbudowac XML do podpisu.

```ts
import { buildAuthTokenRequestXml } from "ksef-client-typescript";

const xml = buildAuthTokenRequestXml({
  challenge: "...",
  contextIdentifierType: "nip",
  contextIdentifierValue: "5265877635",
});
```
