# KSeF Client (TypeScript)

`ksef-client` to TypeScript SDK do integracji z KSeF.
Biblioteka udostępnia typowane klienty endpointów, gotowe workflowy (auth/sesje/eksport) i narzędzia pomocnicze (XAdES, QR, linki weryfikacyjne).

## Kompatybilność

- KSeF API: `v2.8.1` ([changelog API](https://github.com/CIRFMF/ksef-api/blob/main/api-changelog.md#wersja-281))
- Node.js: `>= 22.19.0`
- Środowiska: `TEST`, `DEMO`, `PRD`

KSeF `2.8.1` dodaje uprawnienie `CollectiveIdentifierManage`, nowe grupy limitów
(`anonymous`, `global`, `onlineSessionClose`, `batchSessionClose`) i kody walut
`CNH`, `VED`, `XTS`, `ZWG`, `SLE`. Błędy 403 mogą nie zawierać `timestamp`.
SDK obsługuje wszystkie 83 operacje kontraktu; bogatszy format błędów możesz
wymusić przez `X-Error-Format: problem-details` w `KsefClientOptions.headers`.

Kontrakt jest zapisany w `specs/ksef-openapi.snapshot.json`; generowanie typów
oraz testy pokrycia API korzystają z niego bez dodatkowych repozytoriów.

## Instalacja

```bash
npm install ksef-client
```

Opcjonalne zależności:

```bash
npm install qrcode node-forge libxmljs2
```

- `qrcode` jest wymagane dla `client.qr`
- `node-forge` jest opcjonalnym peer dependency dla `XadesKeyPair.fromPkcs12*`; nie instaluje się automatycznie. Najnowsza wersja 1.4.0 ma zgłoszenie [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) dotyczące weryfikacji podpisów RSA. SDK używa jej wyłącznie do odczytu PKCS#12; podpisy weryfikuje `node:crypto`. Możesz użyć `XadesKeyPair.fromPem*` bez tej zależności.
- `libxmljs2` jest wymagane tylko dla runtime walidacji `FA3Draft.toXml({ xsdValidate: true })`; schematy FA(3) są pakowane z biblioteką

## Quick Start

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

## Use Cases

- Token auth i pierwszy request: [`docs/getting-started.md`](docs/getting-started.md)
- Uwierzytelnienie certyfikatem (XAdES): [`docs/workflows/auth.md`](docs/workflows/auth.md)
- Wysyłka faktur w sesji online: [`docs/workflows/online-session.md`](docs/workflows/online-session.md)
- Wysyłka wsadowa (ZIP): [`docs/workflows/batch-session.md`](docs/workflows/batch-session.md)
- Tryb offline (`offline24` / `offline`): [`docs/workflows/offline.md`](docs/workflows/offline.md)
- Eksport i eksport przyrostowy: [`docs/workflows/export.md`](docs/workflows/export.md)
- Gotowe snippety end-to-end: [`docs/examples/README.md`](docs/examples/README.md)

## Dokumentacja

- Start: [`docs/getting-started.md`](docs/getting-started.md)
- Konfiguracja i błędy: [`docs/configuration.md`](docs/configuration.md), [`docs/errors.md`](docs/errors.md)
- API endpointów: [`docs/api/README.md`](docs/api/README.md)
- Workflows: [`docs/workflows/README.md`](docs/workflows/README.md)
- Usługi i utils: [`docs/services/README.md`](docs/services/README.md), [`docs/utils/README.md`](docs/utils/README.md)
- Przykłady: [`docs/examples/README.md`](docs/examples/README.md)
- Pełny indeks: [`docs/README.md`](docs/README.md)
- Dla maintainerów: [`docs/maintainers.md`](docs/maintainers.md)

## Bezpieczeństwo

- Nie loguj tokenów i kluczy prywatnych.
- Przekazuj dane `KSEF_*` przez zmienne środowiskowe/secrets.
- Nie commituj plików certyfikatów i kluczy (`.pem`, `.p12`, `.pfx`).

## Licencja

MIT. Zobacz [`LICENSE`](LICENSE).
