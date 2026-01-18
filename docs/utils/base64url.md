# base64url

## API

- `toBase64Url(buffer)`
- `fromBase64Url(string)`

## Przyklad

```ts
import { toBase64Url, fromBase64Url } from "ksef-client-typescript";

const encoded = toBase64Url(Buffer.from("test"));
const decoded = fromBase64Url(encoded).toString("utf8");
```
