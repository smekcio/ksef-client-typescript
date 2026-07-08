# KSeF Client (TypeScript)

`ksef-client` to TypeScript SDK do integracji z KSeF.
Biblioteka udostępnia typowane klienty endpointów, gotowe workflowy (auth/sesje/eksport) i narzędzia pomocnicze (XAdES, QR, linki weryfikacyjne).

## Kompatybilność

- KSeF API: `v2.4.0`
- Node.js: `>= 20`
- Środowiska: `TEST`, `DEMO`, `PRD`

KSeF `2.4.0` rozszerza obsługę błędów o `application/problem+json` oraz doprecyzowuje operacje
na tokenie użytym do bieżącego uwierzytelnienia. SDK zachowuje dotychczasowe metody klientów,
a bogatszy format błędów możesz wymusić przez nagłówek
`X-Error-Format: problem-details` ustawiony w `KsefClientOptions.headers`.

## Instalacja

```bash
npm install ksef-client
```

Opcjonalne zależności:

```bash
npm install qrcode node-forge
```

- `qrcode` jest wymagane dla `client.qr`
- `node-forge` jest wymagane dla `XadesKeyPair.fromPkcs12*`

## Budowanie faktur FA(3)

SDK udostępnia typed builder `FA3Invoice` do generowania poprawnie sformatowanego XML FA(3):

```ts
import { FA3Invoice, FA3Party, FA3TaxCategory } from "ksef-client";

const invoice = FA3Invoice.basic("FV/001/2026")
  .seller(FA3Party.polishCompany({ nip: "1111111111", name: "Sprzedawca", address: "ul. Test 1" }))
  .buyer(FA3Party.polishCompany({ nip: "2222222222", name: "Nabywca", address: "ul. Test 2" }))
  .issueDate("2026-01-07")
  .addServiceLine("Usluga", { quantity: "1", unitNetPrice: "100", tax: FA3TaxCategory.standard23() })
  .build();

const xml = invoice.toXml();
const wellFormedXml = invoice.toXmlWellFormed();
```

Szczegoly API, korekty, zaliczki i walidacja XML: [`docs/xml/invoice.md`](docs/xml/invoice.md).

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
