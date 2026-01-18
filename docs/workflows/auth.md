# Workflow: uwierzytelnianie (token KSeF / XAdES)

W procesie uwierzytelniania uzyskujesz `accessToken` i `refreshToken`.

## Wariant A: token KSeF

```ts
import { KsefClient } from "ksef-client-typescript";

const client = await KsefClient.connect({
  environment: "DEMO",
  token: process.env.KSEF_TOKEN!,
  context: { type: "Nip", value: "5265877635" },
});
```

## Wariant B: XAdES (podpisany XML)

```ts
import { AuthCoordinator } from "ksef-client-typescript";

const signedXml = "<AuthTokenRequest>...signed...</AuthTokenRequest>";

const tokens = await client.workflows.auth.authenticateWithXadesSignature({
  signedXml,
  verifyCertificateChain: true,
});
```

## Wariant C: XAdES (certyfikat + klucz)

```ts
import { XadesKeyPair } from "ksef-client-typescript";

const keyPair = XadesKeyPair.fromPem({
  // Zawartosc PEM (nie sciezka do pliku)
  certificatePem: process.env.KSEF_XADES_CERT_PEM!,
  privateKeyPem: process.env.KSEF_XADES_KEY_PEM!,
});

const tokens = await client.workflows.auth.authenticateWithCertificate({
  keyPair,
  context: { type: "Nip", value: "5265877635" },
  signaturePackaging: "enveloped",
  verifyCertificateChain: true,
});
```

## Budowanie XML do podpisu

```ts
import { buildAuthTokenRequestXml } from "ksef-client-typescript";

const xml = buildAuthTokenRequestXml({
  challenge: "...",
  contextIdentifierType: "nip",
  contextIdentifierValue: "5265877635",
});
```
