# Buffer utils

## API

- `splitBuffer(buffer, maxPartSize)`

## Przyklad

```ts
import { splitBuffer } from "ksef-client-typescript";

const parts = splitBuffer(Buffer.from("123456"), 2);
console.log(parts.map((p) => p.toString("utf8")));
```
