# Workflow: uwierzytelnianie (token KSeF / XAdES)

`AuthCoordinator` realizuje pełny proces auth:
`challenge -> init auth -> polling statusu -> redeem tokenów`.

Workflow jest dostępny pod `client.workflows.auth`.
`KsefClient.connect(...)` korzysta z niego automatycznie.

## Metody

- `client.workflows.auth.authenticateWithKsefToken(options)`
- `client.workflows.auth.authenticateWithXadesSignature(options)`
- `client.workflows.auth.authenticateWithCertificate(options)`

## Wariant A: token KSeF (zalecany start)

```ts
import { KsefClient } from "ksef-client-typescript";

const client = new KsefClient({ environment: "DEMO" });

const tokens = await client.workflows.auth.authenticateWithKsefToken({
  token: process.env.KSEF_TOKEN!,
  context: { type: "Nip", value: process.env.KSEF_NIP ?? "5265877635" },
  encryptionMethod: "rsa", // albo "ec"
  ecOutputFormat: "java", // istotne tylko dla "ec"
  pollIntervalMs: 2000,
  maxAttempts: 90,
});

client.authManager.setTokens(tokens);
```

Uwagi:

- `publicCertificateBase64Der` jest opcjonalne; gdy go nie podasz, workflow pobierze certyfikat `KsefTokenEncryption` z `security.getPublicKeyCertificates()`.
- Domyślne wartości pollingu: `pollIntervalMs=2000`, `maxAttempts=30`.

## Wariant B: token KSeF z jawnym certyfikatem i szyfrowaniem EC

```ts
const certs = await client.security.getPublicKeyCertificates();
const tokenCert = certs.find((item) => item.usage.includes("KsefTokenEncryption"));
if (!tokenCert) {
  throw new Error("Missing KsefTokenEncryption certificate");
}

const tokens = await client.workflows.auth.authenticateWithKsefToken({
  token: process.env.KSEF_TOKEN!,
  context: { type: "Nip", value: "5265877635" },
  publicCertificateBase64Der: tokenCert.certificate,
  encryptionMethod: "ec",
  ecOutputFormat: "java",
});

client.authManager.setTokens(tokens);
```

## Wariant C: XAdES z gotowym podpisanym XML

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

`enforceXadesCompliance: true` ustawia nagłówek
`X-KSeF-Feature: enforce-xades-compliance`.

## Wariant D: XAdES z certyfikatu i klucza (PEM)

```ts
import { XadesKeyPair } from "ksef-client-typescript";

const keyPair = XadesKeyPair.fromPem({
  certificatePem: process.env.KSEF_XADES_CERT_PEM!,
  privateKeyPem: process.env.KSEF_XADES_KEY_PEM!,
  // privateKeyPassword: "...", // opcjonalnie
});

const tokens = await client.workflows.auth.authenticateWithCertificate({
  keyPair,
  context: { type: "Nip", value: process.env.KSEF_NIP ?? "5265877635" },
  subjectIdentifierType: "certificateSubject", // albo "certificateFingerprint"
  signaturePackaging: "enveloped", // albo "enveloping"
  verifyCertificateChain: true,
  enforceXadesCompliance: true,
});

client.authManager.setTokens(tokens);
```

Możesz też załadować pliki bezpośrednio:

```ts
import { XadesKeyPair } from "ksef-client-typescript";

const keyPair = XadesKeyPair.fromPemFiles({
  certificatePath: "./cert.crt",
  privateKeyPath: "./private.key",
  // privateKeyPassword: "...",
});
```

## Wariant E: XAdES z kontenera PKCS#12 (`.p12` / `.pfx`)

```ts
import { XadesKeyPair } from "ksef-client-typescript";

const keyPair = await XadesKeyPair.fromPkcs12File({
  pkcs12Path: "./cert.p12",
  pkcs12Password: process.env.KSEF_XADES_PKCS12_PASSWORD,
});

const tokens = await client.workflows.auth.authenticateWithCertificate({
  keyPair,
  context: { type: "Nip", value: process.env.KSEF_NIP ?? "5265877635" },
});

client.authManager.setTokens(tokens);
```

Uwaga: obsługa PKCS#12 wymaga opcjonalnej zależności `node-forge`.

## Wariant F: manualny flow auth przez thin API

Ten wariant przydaje się, gdy chcesz samodzielnie kontrolować request/response.

```ts
import { CryptographyService } from "ksef-client-typescript";

const challenge = await client.auth.getChallenge();
const parsedTimestamp = Date.parse(challenge.timestamp);
const timestampMs =
  challenge.timestampMs ?? (Number.isNaN(parsedTimestamp) ? Date.now() : parsedTimestamp);

const certs = await client.security.getPublicKeyCertificates();
const tokenCert = certs.find((item) => item.usage.includes("KsefTokenEncryption"));
if (!tokenCert) {
  throw new Error("Missing KsefTokenEncryption certificate");
}

const encryptedToken = CryptographyService.encryptKsefToken(
  process.env.KSEF_TOKEN!,
  timestampMs,
  tokenCert.certificate,
  "rsa",
  "java",
);

const init = await client.auth.authenticateWithKsefToken({
  challenge: challenge.challenge,
  contextIdentifier: { type: "Nip", value: process.env.KSEF_NIP ?? "5265877635" },
  encryptedToken,
});

for (let attempt = 0; attempt < 90; attempt += 1) {
  const status = await client.auth.getAuthStatus(
    init.referenceNumber,
    init.authenticationToken.token,
  );

  if (status.status.code === 200) {
    const tokens = await client.auth.redeemToken(init.authenticationToken.token);
    client.authManager.setTokens(tokens);
    break;
  }

  if (status.status.code !== 100) {
    throw new Error(`Auth failed: ${status.status.code} ${status.status.description}`);
  }

  await new Promise((resolve) => setTimeout(resolve, 2000));
}
```

W statusie auth używaj `authenticationMethodInfo`; pole `authenticationMethod` jest deprecated.

## Odświeżanie `accessToken`

Po `client.authManager.setTokens(...)` odświeżanie jest realizowane automatycznie.

Manualnie (gdy potrzebujesz):

```ts
// `tokens` pochodzi z udanego auth (np. authenticateWithKsefToken / authenticateWithCertificate)
const refreshToken = tokens.refreshToken.token;
const refreshed = await client.auth.refreshAccessToken(refreshToken);
client.authManager.setAccessToken(refreshed.accessToken.token, refreshed.accessToken.validUntil);
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

## Najczęstsze problemy

- `401` przy statusie auth: do `getAuthStatus(...)` przekazujesz `authenticationToken`, nie `accessToken`.
- `KsefAuthStatusError` (np. HTTP `460`): najczęściej problem z certyfikatem (np. zawieszony).
- Auth nie kończy się w czasie: zwiększ `maxAttempts` i upewnij się, że polling nie jest zbyt rzadki.
- Przy długim procesie podpisu XAdES pobierz nowe `challenge` przed init auth.
