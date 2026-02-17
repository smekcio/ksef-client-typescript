# XAdES (`XadesKeyPair`, `XadesSignatureService`)

Usługi XAdES służą do podpisywania `AuthTokenRequest` zgodnie z wymaganiami KSeF.

## `XadesKeyPair`

Klasa porządkuje pracę z certyfikatem i kluczem prywatnym.

### `XadesKeyPair.fromPem(options)`

Wczytanie z zawartości PEM:

```ts
import { XadesKeyPair } from "ksef-client-typescript";

const keyPair = XadesKeyPair.fromPem({
  certificatePem: process.env.KSEF_XADES_CERT_PEM!,
  privateKeyPem: process.env.KSEF_XADES_KEY_PEM!,
  privateKeyPassword: process.env.KSEF_XADES_KEY_PASSWORD,
});
```

### `XadesKeyPair.fromPemFiles(options)`

Wczytanie z plików PEM/DER:

```ts
const keyPair = XadesKeyPair.fromPemFiles({
  certificatePath: "cert.crt",
  privateKeyPath: "key.pem",
});
```

### `XadesKeyPair.fromPkcs12(options)` / `fromPkcs12File(options)`

Dla kontenerów `.p12`/`.pfx` (wymagana opcjonalna zależność `node-forge`):

```bash
npm i node-forge
```

```ts
const keyPair = await XadesKeyPair.fromPkcs12File({
  pkcs12Path: "cert.p12",
  pkcs12Password: process.env.KSEF_XADES_PKCS12_PASSWORD,
});
```

## `XadesSignatureService`

### `signXadesEnveloped(options) -> string`

Podpisuje XML w wariancie enveloped (podpis osadzony w dokumencie).

### `signXadesEnveloping(options) -> string`

Podpisuje XML w wariancie enveloping (`ds:Signature` jest korzeniem, `AuthTokenRequest` trafia do `ds:Object`).

Przykład:

```ts
import {
  XadesKeyPair,
  XadesSignatureService,
  buildAuthTokenRequestXml,
} from "ksef-client-typescript";

const xml = buildAuthTokenRequestXml({
  challenge: "CHALLENGE",
  contextIdentifierType: "Nip",
  contextIdentifierValue: "5265877635",
});

const keyPair = XadesKeyPair.fromPem({
  certificatePem: process.env.KSEF_XADES_CERT_PEM!,
  privateKeyPem: process.env.KSEF_XADES_KEY_PEM!,
});

const signedXml = new XadesSignatureService().signXadesEnveloped({ xml, keyPair });
console.log(signedXml.length);
```

## Integracja z workflow auth

Najczęściej zamiast ręcznego podpisywania używa się:
- `client.workflows.auth.authenticateWithCertificate(...)`

Powiązane: [Auth (XML i proces uwierzytelnienia)](auth.md).
