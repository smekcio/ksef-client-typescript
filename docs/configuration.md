# Konfiguracja klienta

## KsefClientOptions

Dostepne opcje dla `new KsefClient(...)` oraz `KsefClient.connect(...)`:

- `baseUrl`: pelny adres API, np. `https://api-demo.ksef.mf.gov.pl/v2`.
- `environment`: `"TEST" | "DEMO" | "PRD"` (uzyj zamiast `baseUrl`).
- `timeoutMs`: timeout dla zapytan HTTP.
- `proxy`: adres proxy (np. `http://127.0.0.1:8080`).
- `noProxy`: lista hostow bez proxy (`"*.mf.gov.pl,localhost"`).
- `headers`: dodatkowe naglowki domyslne.
- `baseQrUrl`: baza dla linkow QR (domyslnie per srodowisko).
- `retryOn429`: automatyczny retry na 429 (domyslnie `true` dla metod idempotentnych).
- `maxRetryAttempts`: maksymalna liczba prob (domyslnie `3`).
- `maxRetryDelayMs`: limit opoznienia retry (domyslnie `10000`).

## Przyklad

```ts
import { KsefClient } from "ksef-client-typescript";

const client = new KsefClient({
  environment: "DEMO",
  timeoutMs: 45_000,
  proxy: process.env.HTTPS_PROXY,
  noProxy: process.env.NO_PROXY,
  headers: { "X-App-Name": "demo" },
  retryOn429: true,
  maxRetryAttempts: 3,
  maxRetryDelayMs: 10_000,
});
```

## Proxy z env

Jesli nie ustawisz `proxy`, SDK czyta:

- `HTTPS_PROXY`
- `HTTP_PROXY`
- `NO_PROXY`

## baseQrUrl

Mozesz nadpisac adres dla linkow QR (np. w testach):

```ts
const client = new KsefClient({
  baseUrl: "https://api-demo.ksef.mf.gov.pl/v2",
  baseQrUrl: "https://qr-demo.ksef.mf.gov.pl",
});
```
