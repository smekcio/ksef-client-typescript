# Klient główny (`KsefClient`)

`KsefClient` agreguje podklienty API, workflow i usługi pomocnicze.

## Zakres

Podklienci domenowi:

- `client.auth`
- `client.activeSessions`
- `client.sessions`
- `client.invoices`
- `client.permissions`
- `client.certificates`
- `client.tokens`
- `client.collectiveIdentifiers`
- `client.limits`
- `client.security`
- `client.testdata`
- `client.peppol`
- `client.lighthouse`

Warstwa workflow:

- `client.workflows.auth`
- `client.workflows.sessions.online`
- `client.workflows.sessions.batch`
- `client.workflows.offline`
- `client.workflows.exports`
- `client.workflows.exportsIncremental`

Usługi pomocnicze:

- `client.verificationLinks`
- `client.qr`
- `client.personToken`
- `client.authManager`

## Inicjalizacja

```ts
import { KsefClient } from "ksef-client-typescript";

const client = new KsefClient({
  environment: "DEMO",
});
```

Możesz też użyć jawnego `baseUrl`:

```ts
import { KsefClient } from "ksef-client-typescript";

const client = new KsefClient({
  baseUrl: "https://api-demo.ksef.mf.gov.pl",
});
```

Szczegóły opcji: [`../configuration.md`](../configuration.md).

## Szybkie połączenie (`KsefClient.connect`)

```ts
import { KsefClient } from "ksef-client-typescript";

const client = await KsefClient.connect({
  environment: "DEMO",
  token: process.env.KSEF_TOKEN!,
  context: { type: "Nip", value: "5265877635" },
  pollIntervalMs: 2000,
  maxAttempts: 60,
});
```

`connect(...)`:

1. tworzy instancję klienta,
2. wykonuje workflow `authenticateWithKsefToken(...)`,
3. zapisuje uzyskane tokeny w `client.authManager`.

## `authManager`

`authManager` przechowuje `accessToken` i `refreshToken`, a przy zbliżającym się wygaśnięciu automatycznie odświeża token dostępu.

Ręczne ustawienie tokenów:

```ts
const tokens = await client.workflows.auth.authenticateWithKsefToken({
  token: process.env.KSEF_TOKEN!,
  context: { type: "Nip", value: "5265877635" },
});

client.authManager.setTokens(tokens);
```

## Przykład pierwszego wywołania API

```ts
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
  10,
  "Desc",
);

console.log(metadata);
```
