# Start

Ten dokument prowadzi przez pierwszy, produkcyjny flow w kolejnosci:
`konfiguracja -> auth -> API -> workflowy -> bledy`.

Kompatybilnosc SDK: **KSeF API `2.1.1`**.

## 1) Konfiguracja klienta

Mozesz uzyc `environment` albo `baseUrl`:

```ts
import { KsefClient } from "ksef-client-typescript";

const client = new KsefClient({
  environment: "DEMO",
  timeoutMs: 45_000,
  retryOn429: true,
  maxRetryAttempts: 3,
  maxRetryDelayMs: 10_000,
  headers: { "X-App-Name": "ksef-integration" },
});
```

Pelna lista opcji: [configuration.md](configuration.md).

## 2) Auth - najkrotsza sciezka (`KsefClient.connect`)

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

`connect(...)` uruchamia workflow tokenowy, a potem ustawia `accessToken` i `refreshToken` w `authManager`.

## 3) Auth - manualnie przez workflow auth

```ts
import { KsefClient } from "ksef-client-typescript";

const client = new KsefClient({ environment: "DEMO" });

const tokens = await client.workflows.auth.authenticateWithKsefToken({
  token: process.env.KSEF_TOKEN!,
  context: { type: "Nip", value: "5265877635" },
  encryptionMethod: "rsa", // albo "ec"
  ecOutputFormat: "java",  // istotne tylko dla "ec"
});

client.authManager.setTokens(tokens);
```

## 4) Pierwsze wywolanie API

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
  20,
  "Asc",
);

console.log(metadata);
```

`dateRange` jest walidowany lokalnie. SDK rzuci `KsefValidationError`, gdy:
- `from` lub `to` nie sa poprawnym ISO,
- `to < from`,
- zakres przekroczy 3 miesiace,
- brak `subjectType` albo `dateRange`.

## 5) Pierwszy workflow biznesowy (sesja online)

```ts
const session = await client.workflows.sessions.online.open({
  formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
  upoV43: true,
});

const send = await session.sendInvoice({ invoice: "<Faktura>...</Faktura>" });
console.log(send.referenceNumber);

await session.close();
const upoXml = await session.waitForUpo({ pollIntervalMs: 2000, maxAttempts: 60 });
console.log(upoXml ? "UPO gotowe" : "Brak UPO w limicie prob");
```

## 6) Auth status i `authenticationMethodInfo`

```ts
const init = await client.auth.authenticateWithKsefToken({
  challenge: "...",
  contextIdentifier: { type: "Nip", value: "5265877635" },
  encryptedToken: "BASE64",
});

const status = await client.auth.getAuthStatus(
  init.referenceNumber,
  init.authenticationToken.token,
);

console.log(status.authenticationMethodInfo.code); // np. "ksefToken" / "xades"
```

`authenticationMethod` jest polem deprecated; uzywaj `authenticationMethodInfo`.

## 7) Obsluga bledow

```ts
import {
  KsefAuthStatusError,
  KsefRateLimitError,
  KsefValidationError,
} from "ksef-client-typescript";

try {
  await client.invoices.queryInvoiceMetadata({
    subjectType: "Subject1",
    dateRange: { dateType: "Issue", from: "2025-01-01", to: "2025-05-01" },
  });
} catch (error) {
  if (error instanceof KsefValidationError) {
    console.error("Walidacja:", error.message, error.details);
  }

  if (error instanceof KsefAuthStatusError) {
    console.error("Auth status:", error.statusCode, error.statusDetails);
  }

  if (error instanceof KsefRateLimitError) {
    console.error("Retry-After:", error.retryAfter);
  }

  throw error;
}
```

Szczegoly: [errors.md](errors.md).
