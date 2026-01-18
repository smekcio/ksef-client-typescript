# XAdES

`XadesSignatureService` generuje podpis XAdES (enveloped) dla dokumentu `AuthTokenRequest`, zgodnie z wymaganiami KSeF.

## Key material

### PEM

```ts
import { XadesKeyPair } from "ksef-client-typescript";

const keyPair = XadesKeyPair.fromPem({
  // Zawartosc PEM (nie sciezka do pliku)
  certificatePem: process.env.KSEF_XADES_CERT_PEM!,
  privateKeyPem: process.env.KSEF_XADES_KEY_PEM!,
});
```

### Pliki PEM/DER

```ts
import { XadesKeyPair } from "ksef-client-typescript";

const keyPair = XadesKeyPair.fromPemFiles({
  certificatePath: "cert.crt", // PEM lub DER
  privateKeyPath: "key.pem", // PEM lub DER
  privateKeyPassword: process.env.KSEF_XADES_KEY_PASSWORD,
});
```

### PKCS#12 (.p12/.pfx)

Wersja PKCS#12 korzysta z opcjonalnej zaleznosci `node-forge`.

```ts
import { XadesKeyPair } from "ksef-client-typescript";
import fs from "node:fs";

const keyPair = await XadesKeyPair.fromPkcs12({
  pkcs12Bytes: await fs.promises.readFile("cert.p12"),
  pkcs12Password: "****",
});
```

Wariant z pliku:

```ts
const keyPair = await XadesKeyPair.fromPkcs12File({
  pkcs12Path: "cert.p12",
  pkcs12Password: process.env.KSEF_XADES_PKCS12_PASSWORD,
});
```

## Podpisywanie

```ts
import { XadesSignatureService } from "ksef-client-typescript";

const service = new XadesSignatureService();
const signedXml = service.signXadesEnveloped({
  xml: "<AuthTokenRequest>...</AuthTokenRequest>",
  keyPair,
});
```

## Enveloping (otaczajacy)

KSeF dopuszcza podpisy otaczajace. W tym wariancie dokument `AuthTokenRequest` jest umieszczany wewnatrz `ds:Object`,
a korzeniem XML jest `ds:Signature`.

```ts
const signedXml = service.signXadesEnveloping({
  xml: "<AuthTokenRequest>...</AuthTokenRequest>",
  keyPair,
});
```
