# KSeF TypeScript SDK - dokumentacja

Dokumentacja opisuje publiczne API biblioteki `ksef-client-typescript` oraz gotowe workflowy do auth, sesji i eksportu.
Kontrakty API i dokumenty procesowe znajduja sie w `ksef-docs/`.

## Wymagania

- Node.js >= 20
- Dostep do srodowiska KSeF (`TEST`, `DEMO`, `PRD`)
- Dane uwierzytelniajace (token KSeF lub XAdES)

## Struktura i flow

Ta dokumentacja jest ulozona tak samo jak w `ksef-client-python/docs`:

1. Konfiguracja: [configuration.md](configuration.md), [getting-started.md](getting-started.md)
2. Uwierzytelnianie: [api/auth.md](api/auth.md), [workflows/auth.md](workflows/auth.md)
3. API (thin clients): [docs/api](api/README.md)
4. Workflowy: [docs/workflows](workflows/README.md)
5. Bledy i retry: [errors.md](errors.md)

Biblioteka ma dwa poziomy uzycia:

1. Thin API clients (`client.auth`, `client.sessions`, `client.invoices`, ...).
2. Workflows (`client.workflows.auth`, `client.workflows.sessions.*`, `client.workflows.exports`).

## Szybki przyklad: `connect(...)` + query

```ts
import { KsefClient } from "ksef-client-typescript";

const client = await KsefClient.connect({
  environment: "DEMO",
  token: process.env.KSEF_TOKEN!,
  context: { type: "Nip", value: "5265877635" },
});

const metadata = await client.invoices.queryInvoiceMetadata(
  {
    subjectType: "Subject1",
    dateRange: { dateType: "Issue", from: "2025-01-01", to: "2025-01-31" },
  },
  0,
  10,
  "Desc",
);

console.log(metadata);
```

## Szybki przyklad: manual auth i ustawienie tokenow

```ts
import { KsefClient } from "ksef-client-typescript";

const client = new KsefClient({ environment: "DEMO" });

const tokens = await client.workflows.auth.authenticateWithKsefToken({
  token: process.env.KSEF_TOKEN!,
  context: { type: "Nip", value: "5265877635" },
  pollIntervalMs: 2000,
  maxAttempts: 60,
});

client.authManager.setTokens(tokens);

const xml = await client.invoices.getInvoice("KSEF_NUMBER");
console.log(xml.slice(0, 120));
```

## Nawigacja

- Start: [getting-started.md](getting-started.md)
- Konfiguracja: [configuration.md](configuration.md)
- API: [api/README.md](api/README.md)
- Workflows: [workflows/README.md](workflows/README.md)
- Services: [services/README.md](services/README.md)
- Przyklady: [examples/README.md](examples/README.md)
- Bledy: [errors.md](errors.md)
- Raport parity: [parity-ksef-docs.md](parity-ksef-docs.md)
