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

SDK wysyla podpisany XML, ale nie generuje podpisu XAdES.

```ts
const result = await client.workflows.auth.authenticateWithXadesSignature({
  signedXml: "<AuthTokenRequest>...signed...</AuthTokenRequest>",
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
