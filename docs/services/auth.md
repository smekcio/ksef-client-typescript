# Uwierzytelnianie (`AuthCoordinator`, `buildAuthTokenRequestXml`)

W typowych scenariuszach używaj `client.workflows.auth` (klasa `AuthCoordinator`).

## `buildAuthTokenRequestXml(options) -> string`

Buduje XML `AuthTokenRequest` do podpisu XAdES.

Najważniejsze pola:

- `challenge`: z `client.auth.getChallenge()`
- `contextIdentifierType`: `"Nip" | "InternalId" | "NipVatUe" | "PeppolId"` (funkcja akceptuje też warianty case-insensitive, np. `"nip"`)
- `contextIdentifierValue`: wartość identyfikatora kontekstu (np. NIP)
- `subjectIdentifierType`: domyślnie `"certificateSubject"`; alternatywnie `"certificateFingerprint"`
- `authorizationPolicyXml`: opcjonalny fragment XML z polityką autoryzacji

Przykład:

```ts
import { buildAuthTokenRequestXml } from "ksef-client-typescript";

const xml = buildAuthTokenRequestXml({
  challenge: "CHALLENGE",
  contextIdentifierType: "Nip",
  contextIdentifierValue: "5265877635",
  subjectIdentifierType: "certificateSubject",
});
```

## `CryptographyService.encryptKsefToken(...) -> string`

Szyfruje payload `"{token}|{timestampMs}"` i zwraca Base64 (standardowe, nie Base64Url).

Parametry:

- `token`: token KSeF
- `timestampMs`: zwykle z `challenge.timestampMs`
- `publicCertificate`: certyfikat KSeF `KsefTokenEncryption` (PEM albo Base64 DER)
- `method`: `"rsa" | "ec"`
- `ecOutputFormat`: `"java" | "csharp"` (istotne tylko dla `method: "ec"`)

## `AuthCoordinator.authenticateWithKsefToken(options)`

Scenariusz:

1. `GET /auth/challenge`
2. szyfrowanie tokena (`token|timestampMs`)
3. `POST /auth/ksef-token`
4. polling `GET /auth/{referenceNumber}`
5. `POST /auth/token/redeem`

Przykład:

```ts
const tokens = await client.workflows.auth.authenticateWithKsefToken({
  token: process.env.KSEF_TOKEN!,
  context: { type: "Nip", value: "5265877635" },
  encryptionMethod: "rsa",
  pollIntervalMs: 2000,
  maxAttempts: 60,
});

client.authManager.setTokens(tokens);
```

## `AuthCoordinator.authenticateWithXadesSignature(options)`

Wariant dla wcześniej podpisanego XML:

```ts
const tokens = await client.workflows.auth.authenticateWithXadesSignature({
  signedXml: "<AuthTokenRequest>...podpisany...</AuthTokenRequest>",
  verifyCertificateChain: true,
  enforceXadesCompliance: true,
  pollIntervalMs: 2000,
  maxAttempts: 60,
});
```

`enforceXadesCompliance: true` dodaje nagłówek `X-KSeF-Feature: enforce-xades-compliance`.

## `AuthCoordinator.authenticateWithCertificate(options)`

Najwygodniejszy wariant XAdES: SDK buduje `AuthTokenRequest`, podpisuje XML i wysyła żądanie uwierzytelnienia.

```ts
import { XadesKeyPair } from "ksef-client-typescript";

const keyPair = XadesKeyPair.fromPem({
  certificatePem: process.env.KSEF_XADES_CERT_PEM!,
  privateKeyPem: process.env.KSEF_XADES_KEY_PEM!,
});

const tokens = await client.workflows.auth.authenticateWithCertificate({
  keyPair,
  context: { type: "Nip", value: "5265877635" },
  subjectIdentifierType: "certificateSubject",
  signaturePackaging: "enveloped", // albo "enveloping"
  verifyCertificateChain: true,
  enforceXadesCompliance: true,
});
```

Powiązane: [XAdES](xades.md), [Workflows i scenariusze](workflows.md).
