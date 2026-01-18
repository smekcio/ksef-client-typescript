# XML serialization

## API

- `parseXml(xml)` -> tablica z zachowana kolejnoscia
- `buildXml(document)` -> string
- `buildXmlFromObject(document, options?)` -> string

## Przyklad

```ts
import { parseXml, buildXmlFromObject } from "ksef-client-typescript";

const doc = parseXml("<Root><A>1</A></Root>");

const xml = buildXmlFromObject({
  Root: { A: "1" },
});
```
