# Base64Url

Funkcje konwertują dane binarne między `Buffer` a zapisem Base64Url zgodnym z JWT/JWS
(`+` -> `-`, `/` -> `_`, bez końcowego `=`).

## API

- `toBase64Url(input: Buffer): string`
- `fromBase64Url(input: string): Buffer`

## Przykład

```ts
import { fromBase64Url, toBase64Url } from "ksef-client-typescript";

const source = Buffer.from("zażółć gęślą jaźń", "utf8");
const encoded = toBase64Url(source);
const decoded = fromBase64Url(encoded);

console.log(decoded.toString("utf8")); // "zażółć gęślą jaźń"
```

## Uwagi operacyjne

- `fromBase64Url(...)` automatycznie odtwarza brakujące dopełnienie `=`.
- Funkcje nie wykonują walidacji semantycznej danych; odpowiadają wyłącznie za kodowanie/dekodowanie.
