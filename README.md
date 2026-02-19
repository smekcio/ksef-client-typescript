# KSeF Client (TypeScript)

`ksef-client-typescript` jest repozytorium biblioteki (SDK) publikowanej na npm jako **`ksef-client`**.

## ✅ Funkcjonalności

Biblioteka udostępnia:

- cienką warstwę klientów API mapującą metody na endpointy KSeF,
- gotowe workflow do uwierzytelniania, sesji online/batch oraz eksportu,
- usługi pomocnicze (XAdES, kryptografia, linki weryfikacyjne, QR, parser tokenów osób).

## 🔄 Kompatybilność API KSeF

Aktualna kompatybilność: **KSeF API `v2.1.1`**.

## ⚙️ Wymagania

- Node.js `>= 20`
- dostęp do środowiska KSeF (`TEST`, `DEMO`, `PRD`)
- dane uwierzytelniające (token KSeF lub certyfikat/XAdES)

## 📦 Instalacja

```bash
npm install ksef-client
```

Opcjonalnie (w zależności od używanych funkcji):

```bash
npm install qrcode
npm install node-forge
```

- `qrcode` jest wymagane przez `QrCodeService` (`client.qr`),
- `node-forge` jest wymagane przez obsługę PKCS#12 w `XadesKeyPair.fromPkcs12*`.

## 📚 Dokumentacja

- Indeks: [`docs/README.md`](docs/README.md)
- Start: [`docs/getting-started.md`](docs/getting-started.md)
- Konfiguracja: [`docs/configuration.md`](docs/configuration.md)
- Błędy i retry: [`docs/errors.md`](docs/errors.md)
- API (endpointy): [`docs/api/README.md`](docs/api/README.md)
- Workflows: [`docs/workflows/README.md`](docs/workflows/README.md)
- Usługi: [`docs/services/README.md`](docs/services/README.md)
- Utils: [`docs/utils/README.md`](docs/utils/README.md)
- Przykłady: [`docs/examples/README.md`](docs/examples/README.md)

## 🧪 CI/CD

[![CI](https://github.com/smekcio/ksef-client-typescript/actions/workflows/ci.yml/badge.svg)](https://github.com/smekcio/ksef-client-typescript/actions/workflows/ci.yml)
[![TypeScript E2E TEST token](https://github.com/smekcio/ksef-client-typescript/actions/workflows/e2e-token.yml/badge.svg)](https://github.com/smekcio/ksef-client-typescript/actions/workflows/e2e-token.yml?query=job%3A%22TEST+token+flow%22)
[![TypeScript E2E TEST cert](https://github.com/smekcio/ksef-client-typescript/actions/workflows/e2e-token.yml/badge.svg)](https://github.com/smekcio/ksef-client-typescript/actions/workflows/e2e-token.yml?query=job%3A%22TEST+XAdES+flow%22)
[![TypeScript E2E DEMO token](https://github.com/smekcio/ksef-client-typescript/actions/workflows/e2e-token.yml/badge.svg)](https://github.com/smekcio/ksef-client-typescript/actions/workflows/e2e-token.yml?query=job%3A%22DEMO+token+flow%22)
[![TypeScript E2E DEMO cert](https://github.com/smekcio/ksef-client-typescript/actions/workflows/e2e-token.yml/badge.svg)](https://github.com/smekcio/ksef-client-typescript/actions/workflows/e2e-token.yml?query=job%3A%22DEMO+XAdES+flow%22)

Testy uruchamiane są lokalnie przez Node.js test runner (`node --test`) oraz w GitHub Actions.

Instalacja zależności testowych:

```bash
npm ci
```

Uruchomienie testów:

```bash
npm test
```

Uruchomienie testów z kontrolą pokrycia:

```bash
npm run test:coverage
```

Lokalna kontrola jakości (jak w CI):

```bash
npm run lint
npm run typecheck
```

Podstawowe workflow:

- `CI` (`.github/workflows/ci.yml`) - lint, typecheck i testy.
- `E2E Auth Flows` (`.github/workflows/e2e-token.yml`) - scenariusze token/XAdES dla `TEST` i `DEMO`.
- `Validate API Compliance` (`.github/workflows/validate-openapi.yml`) - kontrola pokrycia endpointów.
- `Release Please` (`.github/workflows/release-please.yml`) - automatyzacja wersjonowania.
- `Publish to npm` (`.github/workflows/publish-npm.yml`) - publikacja paczki.

## 🚀 Quick start

Minimalny przebieg integracji:

1. uwierzytelnienie (np. token KSeF),
2. wywołanie endpointu biznesowego.

```ts
import { KsefClient } from "ksef-client";

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
  10,
  "Desc",
);

console.log(metadata);
```

## 🧩 Najważniejsze snippety

### Uwierzytelnianie tokenem KSeF (workflow)

```ts
import { KsefClient } from "ksef-client";

const client = new KsefClient({ environment: "DEMO" });

const tokens = await client.workflows.auth.authenticateWithKsefToken({
  token: process.env.KSEF_TOKEN!,
  context: { type: "Nip", value: "5265877635" },
  pollIntervalMs: 2000,
  maxAttempts: 60,
});

client.authManager.setTokens(tokens);
```

### Uwierzytelnianie certyfikatem (XAdES)

```ts
import { KsefClient, XadesKeyPair } from "ksef-client";

const client = new KsefClient({ environment: "DEMO" });

const keyPair = await XadesKeyPair.fromPkcs12File({
  pkcs12Path: "./cert.p12",
  pkcs12Password: process.env.XADES_PASSWORD,
});

const tokens = await client.workflows.auth.authenticateWithCertificate({
  keyPair,
  context: { type: "Nip", value: "5265877635" },
  subjectIdentifierType: "certificateSubject",
  enforceXadesCompliance: true,
  pollIntervalMs: 2000,
  maxAttempts: 60,
});

client.authManager.setTokens(tokens);
```

### Wysyłka faktury (sesja online)

```ts
const session = await client.workflows.sessions.online.open({
  formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
  upoV43: true,
});

await session.sendInvoice({ invoice: "<Faktura>...</Faktura>" });
await session.close();

const upoXml = await session.waitForUpo({ pollIntervalMs: 2000, maxAttempts: 60 });
console.log(upoXml ? "UPO odebrane" : "Brak UPO w zadanym limicie prób");
```

## 📄 Licencja

MIT. Zobacz [`LICENSE`](LICENSE).

