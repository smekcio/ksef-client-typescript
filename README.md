# ksef-client-typescript

TypeScript SDK for integrating with the Polish KSeF 2.0 API in Node.js applications.

## Requirements

- Node.js 20 or newer
- Access to KSeF environment (`TEST`, `DEMO`, `PRD`)
- KSeF credentials (token or XAdES flow)

## Installation

```bash
npm install ksef-client-typescript
```

## Quick start

```ts
import { KsefClient } from "ksef-client-typescript";

const client = await KsefClient.connect({
  environment: "DEMO",
  token: process.env.KSEF_TOKEN!,
  context: { type: "Nip", value: "5265877635" },
  pollIntervalMs: 2000,
  maxAttempts: 60,
});

const metadata = await client.invoices.queryInvoiceMetadata(
  {
    subjectType: "Subject1",
    dateRange: {
      dateType: "Issue",
      from: "2025-01-01",
      to: "2025-01-31",
    },
  },
  0,
  20,
  "Asc",
);

console.log(metadata);
```

## Documentation

- Docs index: [`docs/README.md`](docs/README.md)
- Getting started: [`docs/getting-started.md`](docs/getting-started.md)
- API reference: [`docs/api/README.md`](docs/api/README.md)
- Workflows: [`docs/workflows/README.md`](docs/workflows/README.md)
- Error handling: [`docs/errors.md`](docs/errors.md)

## License

MIT. See [`LICENSE`](LICENSE).
