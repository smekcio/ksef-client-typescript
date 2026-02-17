# Pierwsze kroki

Ten przewodnik pokazuje zalecany przebieg pierwszej integracji:
`konfiguracja -> uwierzytelnianie -> pierwsze wywołanie API -> workflow -> obsługa błędów`.

Kompatybilność SDK: **KSeF API `v2.1.1`**.

## 1) Inicjalizacja klienta

Możesz użyć gotowego środowiska (`environment`) albo własnego adresu (`baseUrl`):

```ts
import { KsefClient } from "ksef-client-typescript";

const client = new KsefClient({
  environment: "DEMO",
  timeoutMs: 45_000,
  headers: { "X-App-Name": "ksef-integration" },
  retryOn429: true,
  maxRetryAttempts: 3,
  maxRetryDelayMs: 10_000,
});
```

Pełna lista opcji: [configuration.md](configuration.md).

## 2) Uwierzytelnianie tokenem KSeF (najkrótsza ścieżka)

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

`KsefClient.connect(...)` uruchamia workflow tokenowy i automatycznie zapisuje `accessToken` oraz `refreshToken` w `authManager`.

## 3) Uwierzytelnianie manualne (workflow auth)

```ts
import { KsefClient } from "ksef-client-typescript";

const client = new KsefClient({ environment: "DEMO" });

const tokens = await client.workflows.auth.authenticateWithKsefToken({
  token: process.env.KSEF_TOKEN!,
  context: { type: "Nip", value: "5265877635" },
  encryptionMethod: "rsa", // lub "ec"
  ecOutputFormat: "java", // istotne tylko dla "ec"
  pollIntervalMs: 2000,
  maxAttempts: 60,
});

client.authManager.setTokens(tokens);
```

## 4) Pierwsze wywołanie API

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

`queryInvoiceMetadata(...)` waliduje `dateRange` lokalnie. SDK zgłosi `KsefValidationError`, m.in. gdy zakres dat jest niepoprawny lub przekracza 3 miesiące.

## 5) Pierwszy workflow biznesowy: sesja online

```ts
const session = await client.workflows.sessions.online.open({
  formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
  upoV43: true,
});

const send = await session.sendInvoice({ invoice: "<Faktura>...</Faktura>" });
console.log(send.referenceNumber);

await session.close();

const upoXml = await session.waitForUpo({
  pollIntervalMs: 2000,
  maxAttempts: 60,
});
console.log(upoXml ? "UPO odebrane" : "Brak UPO w zadanym limicie prób");
```

## 6) Istotne zachowania API

- `POST /auth/token/redeem` jest jednorazowe dla danego `authenticationToken`.
- `POST /auth/token/refresh` wymaga przekazania refresh tokena jako `Authorization: Bearer <refreshToken>`; `authManager` realizuje to automatycznie.
- wysyłka/pobieranie partów przez pre-signed URL (workflow batch/eksport) odbywa się bez Bearer tokena.
- `429 Too Many Requests` zwraca `Retry-After`; SDK respektuje ten nagłówek przy automatycznym retry metod idempotentnych.

## 7) Obsługa błędów

```ts
import {
  KsefRateLimitError,
  KsefSessionExpiredError,
  KsefValidationError,
} from "ksef-client-typescript";

try {
  await client.invoices.queryInvoiceMetadata({
    subjectType: "Subject1",
    dateRange: { dateType: "Issue", from: "2025-01-01", to: "2025-05-01" },
  });
} catch (error) {
  if (error instanceof KsefValidationError) {
    console.error("Błąd walidacji:", error.message, error.details);
  } else if (error instanceof KsefRateLimitError) {
    console.error("Rate limit, Retry-After:", error.retryAfter);
  } else if (error instanceof KsefSessionExpiredError) {
    console.error("Sesja wygasła, wymagane ponowne uwierzytelnienie.");
  }
  throw error;
}
```

Szczegóły: [errors.md](errors.md).
