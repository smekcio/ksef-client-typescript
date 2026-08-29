# Pierwsze kroki

Ten przewodnik opisuje minimalny przebieg pierwszej integracji:
`konfiguracja -> uwierzytelnianie -> pierwsze wywołanie API -> workflow -> obsługa błędów`.

Kompatybilność SDK: **KSeF API `v2.3.0`**.

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

Uwaga: `headers` w konfiguracji klienta są globalne i trafią także do requestów na pre-signed URL. Szczegóły bezpieczeństwa: [configuration.md](configuration.md).

## 2) Dane wejściowe do uwierzytelniania

| Dane wejściowe                      | Gdzie wymagane                                                                                                                              | Uwagi                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `token`                             | `KsefClient.connect(...)`, `client.workflows.auth.authenticateWithKsefToken(...)`                                                           | Token KSeF używany do inicjalizacji auth tokenowego.                      |
| `context`                           | `KsefClient.connect(...)`, `client.workflows.auth.authenticateWithKsefToken(...)`, `client.workflows.auth.authenticateWithCertificate(...)` | `ContextIdentifier`, np. `{ type: "Nip", value: "5265877635" }`.          |
| `publicCertificateBase64Der`        | Opcjonalnie w auth tokenowym (`connect(...)` i `authenticateWithKsefToken(...)`)                                                            | Gdy nie podasz, workflow pobierze certyfikat `KsefTokenEncryption`.       |
| certyfikat i klucz prywatny (XAdES) | `client.workflows.auth.authenticateWithCertificate(...)` lub etap podpisu przed `client.workflows.auth.authenticateWithXadesSignature(...)` | Wymagane tylko dla wariantu podpisowego XAdES, nie dla auth tokenem KSeF. |

## 3) Kiedy użyć `KsefClient.connect(...)`, a kiedy manualnego flow

Wybierz `KsefClient.connect(...)`, jeśli:

- używasz standardowego logowania tokenem KSeF,
- wystarcza Ci domyślna sekwencja auth (workflow + zapis tokenów do `authManager`),
- nie potrzebujesz ręcznie kontrolować kroków `challenge -> init -> polling -> redeem`.

Wybierz manualny workflow (`client.workflows.auth.authenticateWithKsefToken(...)` lub thin API), jeśli:

- chcesz jawnie sterować parametrami auth (np. szyfrowanie `rsa`/`ec`, polling, certyfikat),
- chcesz samodzielnie obsługiwać zapis/odświeżanie tokenów lub własną diagnostykę,
- potrzebujesz niestandardowej orkiestracji kroków auth w aplikacji.

## 4) Uwierzytelnianie tokenem KSeF przez `KsefClient.connect(...)`

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

`KsefClient.connect(...)`:

- tworzy instancję klienta,
- uruchamia tokenowy workflow auth,
- zapisuje `accessToken` i `refreshToken` w `authManager`.

## 5) Uwierzytelnianie manualne (workflow auth)

```ts
import { KsefClient } from "ksef-client-typescript";

const client = new KsefClient({ environment: "DEMO" });

const tokens = await client.workflows.auth.authenticateWithKsefToken({
  token: process.env.KSEF_TOKEN!,
  context: { type: "Nip", value: "5265877635" },
  // publicCertificateBase64Der: "...", // opcjonalnie
  encryptionMethod: "rsa", // lub "ec"
  ecOutputFormat: "java", // istotne tylko dla "ec"
  pollIntervalMs: 2000,
  maxAttempts: 60,
});

client.authManager.setTokens(tokens);
```

W wariancie manualnym sam wywołujesz workflow i sam zapisujesz tokeny w `authManager`.

## 6) Pierwsze wywołanie API

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

`queryInvoiceMetadata(...)` waliduje `dateRange` lokalnie. SDK zgłosi `KsefValidationError`, m.in. gdy zakres dat jest niepoprawny lub przekracza 100 dni UTC.

## 7) Pierwszy workflow biznesowy: sesja online

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

## 8) Istotne zachowania API

- `POST /auth/token/redeem` jest jednorazowe dla danego `authenticationToken`.
- `POST /auth/token/refresh` wymaga przekazania refresh tokena jako `Authorization: Bearer <refreshToken>`; `authManager` realizuje to automatycznie.
- wysyłka/pobieranie partów przez pre-signed URL (workflow batch/eksport) odbywa się bez Bearer tokena.
- `429 Too Many Requests` zwraca `Retry-After`; SDK respektuje ten nagłówek przy automatycznym retry metod idempotentnych.

## 9) Obsługa błędów

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
