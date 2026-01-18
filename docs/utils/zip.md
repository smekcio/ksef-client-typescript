# ZIP

## API

- `createZip(entries)`
- `unzip(buffer, options?)`

## Przyklad

```ts
import { createZip, unzip } from "ksef-client-typescript";

const zip = await createZip([{ fileName: "a.txt", content: Buffer.from("test") }]);

const entries = await unzip(zip);
console.log(entries.get("a.txt")?.toString("utf8"));
```
