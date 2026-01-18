# Start

## Instalacja

```bash
npm install ksef-client-typescript
```

## Szybki start (ESM)

```ts
import { KsefClient } from "ksef-client-typescript";

const client = await KsefClient.connect({
  environment: "DEMO",
  token: process.env.KSEF_TOKEN!,
  context: { type: "Nip", value: "5265877635" },
});

const result = await client.invoices.queryInvoiceMetadata({
  subjectType: "Subject1",
  dateRange: { dateType: "Issue", from: "2025-01-01", to: "2025-01-31" },
});

console.log(result);
```

## Szybki start (CJS)

```js
const { KsefClient } = require("ksef-client-typescript");

(async () => {
  const client = await KsefClient.connect({
    environment: "DEMO",
    token: process.env.KSEF_TOKEN,
    context: { type: "Nip", value: "5265877635" },
  });

  const invoiceXml = await client.invoices.getInvoice("KSEFNUMER...");
  console.log(invoiceXml);
})();
```

## Uwaga na srodowisko

- `TEST` i `DEMO` sa srodowiskami testowymi.
- `PRD` to srodowisko produkcyjne.

## Zamykanie polaczen

SDK korzysta z wbudowanego `fetch` (undici). Nie wymaga jawnego `close()`.
