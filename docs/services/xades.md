# XAdES (`XadesKeyPair`, `XadesSignatureService`)

Usługi XAdES służą do podpisywania `AuthTokenRequest` zgodnie z wymaganiami KSeF.

## Wymagania środowiskowe i zależności

- runtime: Node.js (w pakiecie ustawione `engines.node: >=20`);
- używane biblioteki: `@xmldom/xmldom`, `xml-crypto`, `xpath`;
- dla `.p12`/`.pfx` wymagane jest opcjonalne `node-forge` (tylko metody `fromPkcs12*`);
- wykorzystywane są natywne moduły `node:crypto` i `node:fs`.

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

## Ważne zachowania z implementacji

- Algorytm podpisu jest dobierany z klucza publicznego certyfikatu:
  - RSA -> `...#rsa-sha256`
  - EC -> `...#ecdsa-sha256`
- Domyślny `signingTime` to `now + signingTimeSkewMs`, gdzie `signingTimeSkewMs` domyślnie wynosi `-60000` ms.
- W `signXadesEnveloped` referencja do danych podpisywanych celuje w `/*[local-name()='AuthTokenRequest']`.
- Kod patchuje runtime `SignedXml.createReferences`, aby emitować `Reference/@Type` dla `SignedProperties` (wymaganie XAdES).
- Dla ECDSA dodawana jest implementacja `ecdsa-sha256` jeśli biblioteka bazowa jej nie udostępnia.

## Typowe tryby błędów i diagnostyka

`Unsupported key type for XAdES: ...`

- Skąd: certyfikat nie ma klucza `rsa` ani `ec`.
- Sprawdź: typ klucza w certyfikacie i zgodność z `privateKey`.

`Invalid XML: missing document element.`

- Skąd: przekazany XML nie parsuje się do dokumentu z rootem.
- Sprawdź: czy wejście to pełny dokument XML, nie fragment.

`the following xpath cannot be signed because it was not found: ...`

- Skąd: brak węzła pasującego do XPath referencji.
- Sprawdź: czy XML zawiera `AuthTokenRequest`; przy customowym `signedPropertiesId` sprawdź spójność identyfikatora.

`Failed to create SignedInfo node.` / `Failed to parse XML fragment.`

- Skąd: problem z budową/parsowaniem fragmentów XML podpisu.
- Sprawdź: poprawność wejściowego XML i namespace.

`Unable to load private key (unsupported format or wrong password).`

- Skąd: nie udało się zdekodować klucza prywatnego (PEM/DER, typ, hasło).
- Sprawdź: format pliku klucza i hasło przekazywane do `fromPemFiles`.

`PKCS#12 (.p12/.pfx) support requires optional dependency 'node-forge'.`

- Skąd: użyto `fromPkcs12` / `fromPkcs12File` bez `node-forge`.
- Sprawdź: instalację zależności (`npm i node-forge`).

`PKCS#12 does not contain a private key.`
`PKCS#12 does not contain a certificate.`
`PKCS#12 does not contain a matching private key and certificate.`

- Skąd: niepoprawna zawartość kontenera PKCS#12.
- Sprawdź: czy kontener zawiera parę klucz+certyfikat oraz poprawne hasło.

## Integracja z workflow auth

Najczęściej zamiast ręcznego podpisywania używa się:

- `client.workflows.auth.authenticateWithCertificate(...)`

Powiązane: [Auth (XML i proces uwierzytelnienia)](auth.md).
