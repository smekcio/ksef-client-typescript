# Konfiguracja klienta (`KsefClientOptions`)

Konfiguracja dotyczy zarówno `new KsefClient(...)`, jak i `KsefClient.connect(...)`.

## Najważniejsze zasady

- wymagane jest podanie `environment` lub `baseUrl`,
- gdy ustawisz `baseUrl` bez sufiksu `/v2`, biblioteka automatycznie doda `/v2` (chyba ze `appendV2: false`),
- `KsefClient.connect(...)` rozszerza `KsefClientOptions` o opcje potrzebne do logowania tokenem KSeF,
- `headers` są globalne i trafiają do wszystkich requestów klienta, także do requestów na pre-signed URL (upload/download), więc nie należy umieszczać tam `Authorization`.

## `KsefClientOptions`

| Pole                               | Typ                                  | Opis                                                                            | Domyślnie                       |
| ---------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------- |
| `baseUrl`                          | `string`                             | Pełny adres API, np. `https://api-demo.ksef.mf.gov.pl/v2`.                      | Brak                            |
| `environment`                      | `"TEST" \| "DEMO" \| "PRD"`          | Skrót środowiska zamiast `baseUrl`.                                             | Brak                            |
| `appendV2`                         | `boolean`                            | Czy automatycznie dopisywać `/v2` do `baseUrl`, gdy go brakuje.                 | `true`                          |
| `timeoutMs`                        | `number`                             | Timeout pojedynczego żądania HTTP.                                              | `30000`                         |
| `proxy`                            | `string`                             | Proxy HTTP(S), np. `http://127.0.0.1:8080`.                                     | `HTTPS_PROXY` lub `HTTP_PROXY`  |
| `noProxy`                          | `string`                             | Lista hostów bez proxy (CSV), np. `localhost,mf.gov.pl`.                        | `NO_PROXY`                      |
| `headers`                          | `Record<string, string>`             | Dodatkowe nagłówki domyślne dla wszystkich żądań (także pre-signed URL).        | `{}`                            |
| `baseQrUrl`                        | `string`                             | Baza linków weryfikacyjnych QR.                                                 | mapowanie zależne od środowiska |
| `baseLighthouseUrl`                | `string`                             | Jawny base URL Latarni KSeF.                                                    | mapowanie zależne od środowiska |
| `lighthouseEnvironment`            | `"TEST" \| "PROD" \| "PRD"`          | Skrót środowiska Latarni, gdy nie podajesz `baseLighthouseUrl`.                 | mapowanie zależne od środowiska |
| `retryOn429`                       | `boolean`                            | Czy ponawiać żądania po `429` dla metod idempotentnych.                         | `true`                          |
| `retryOn5xx`                       | `boolean`                            | Czy ponawiać żądania po błędach `5xx` dla metod idempotentnych.                 | `true`                          |
| `retryOnTimeout`                   | `boolean`                            | Czy ponawiać timeouty (`AbortError`, `ETIMEDOUT`, itp.) dla metod idempotentnych. | `true`                        |
| `maxRetryAttempts`                 | `number`                             | Maksymalna liczba prób żądania (łącznie z pierwszą).                            | `3`                             |
| `maxRetryDelayMs`                  | `number`                             | Górny limit opóźnienia między próbami.                                          | `10000`                         |
| `strictPresignedUrlValidation`     | `boolean`                            | Dla `skipAuth` wymusza HTTPS dla URL pre-signed.                                 | `true`                          |
| `allowedPresignedHosts`            | `string[]`                           | Allowlista hostów dla URL pre-signed (z `skipAuth`).                            | Brak                            |
| `allowPrivateNetworkPresignedUrls` | `boolean`                            | Czy dopuszczać prywatne/link-local/rezerwowe adresy IP dla URL pre-signed.      | `false`                         |
| `requireExportPartHash`            | `boolean`                            | Domyślna polityka integralności eksportu (`encryptedPartHash`) w workflow eksportu. | `true`                       |

## Uwaga bezpieczeństwa: globalne `headers`

`headers` z `KsefClientOptions` są dołączane do każdego żądania wykonywanego przez klienta.
Dotyczy to również żądań na pre-signed URL używanych przez workflow upload/download.

Nie ustawiaj tutaj nagłówka `Authorization` (ani innych sekretów, np. `Cookie`, `X-Api-Key`).
Autoryzacja do API KSeF jest obsługiwana przez `authManager` i workflow klienta.

### `environment`

Obsługiwane wartości:

- `TEST` -> `https://api-test.ksef.mf.gov.pl/v2`
- `DEMO` -> `https://api-demo.ksef.mf.gov.pl/v2`
- `PRD` -> `https://api.ksef.mf.gov.pl/v2`

### `appendV2`

`appendV2` domyslnie jest wlaczone.

- `appendV2: true` (domyslnie): `https://api-demo.ksef.mf.gov.pl` -> `https://api-demo.ksef.mf.gov.pl/v2`
- `appendV2: false`: `baseUrl` jest uzywany bez dopisywania `/v2`

### `baseQrUrl`

Jeżeli nie ustawisz `baseQrUrl`, klient użyje domyślnego adresu QR dla wskazanego `environment`.
Przy własnym `baseUrl` bez `environment` domyślną bazą QR będzie adres dla środowiska TEST, dlatego warto podać `baseQrUrl` jawnie.

### `baseLighthouseUrl` i `lighthouseEnvironment`

Jesli nie podasz `baseLighthouseUrl`, klient wybierze URL Latarni automatycznie:

- `environment: TEST` lub `DEMO` -> `https://api-latarnia-test.ksef.mf.gov.pl`
- `environment: PRD` -> `https://api-latarnia.ksef.mf.gov.pl`

Mozesz to nadpisac przez:

- `baseLighthouseUrl` (najwyzszy priorytet),
- `lighthouseEnvironment` (`TEST`, `PROD` lub `PRD`).

### Retry (`retryOn429`, `retryOn5xx`, `retryOnTimeout`)

Retry dotyczy metod idempotentnych (`GET`, `PUT`, `DELETE`).
Domyslna polityka:

- ponawianie po `429`,
- ponawianie po `5xx`,
- ponawianie timeoutow.

Laczna liczba prob to `maxRetryAttempts` (z pierwsza proba), a opoznienie jest ograniczone przez `maxRetryDelayMs`.

### Bezpieczenstwo URL pre-signed (`skipAuth`)

Workflowy upload/download uzywaja URL pre-signed bez Bearer tokena (`skipAuth: true`).
Domyslnie SDK blokuje niebezpieczne hosty/protokoly:

- wymagane jest `https` (przy `strictPresignedUrlValidation: true`),
- `localhost`, loopback i prywatne/reserved/link-local IP sa odrzucane (chyba ze jawnie je dopuscisz),
- mozna zawezic do allowlisty `allowedPresignedHosts`.

Te opcje sa globalne i dotycza wszystkich requestow z `skipAuth`.
Walidacja hosta/IP i allowlista dzialaja niezaleznie od `strictPresignedUrlValidation`.

### `requireExportPartHash`

`InvoiceExportWorkflow` domyslnie waliduje `encryptedPartHash` dla kazdej czesci paczki eksportu.

- `requireExportPartHash: true` (domyslnie): brak hashu lub mismatch przerywa workflow,
- `requireExportPartHash: false`: brak wymuszonej walidacji hashy.

### `noProxy`

`noProxy` jest interpretowane jako lista rozdzielona przecinkami:

- wpis dokładny (`api-demo.ksef.mf.gov.pl`),
- wpis domenowy (`mf.gov.pl`, dopasowanie także do subdomen),
- wildcard `*` (wyłączenie proxy dla wszystkich hostów).

## Bezpieczne użycie custom headers

### Kiedy używać

- stałe nagłówki diagnostyczne i śledzące, np. `X-Request-Id`, `X-Correlation-Id`,
- nagłówki identyfikujące aplikację lub wersję integracji, np. `X-App-Name`, `X-App-Version`,
- wymagane przez infrastrukturę pośrednią (proxy/gateway), jeśli mają wartość niesekretną i mogą być wysyłane do wszystkich hostów.

### Czego unikać

- sekretów i danych uwierzytelniających (`Authorization`, `Cookie`, `X-Api-Key`, tokeny użytkownika),
- nagłówków zależnych od użytkownika/sesji w konfiguracji globalnej klienta,
- nagłówków, które są akceptowane tylko przez jeden host, jeśli ten sam klient wykonuje także requesty na pre-signed URL.

### Krótka checklista

- [ ] Czy nagłówek nie zawiera sekretu ani danych uwierzytelniających?
- [ ] Czy nagłówek może bezpiecznie trafić zarówno do API KSeF, jak i na hosty pre-signed URL?
- [ ] Czy wartość jest stała globalnie (a nie per użytkownik/per request)?
- [ ] Czy nagłówek jest wymagany operacyjnie (monitoring, tracing, identyfikacja aplikacji)?

## `KsefConnectOptions`

`KsefConnectOptions` zawiera wszystkie pola `KsefClientOptions` oraz:

| Pole                         | Typ                   | Opis                                                                   |
| ---------------------------- | --------------------- | ---------------------------------------------------------------------- |
| `token`                      | `string`              | Token KSeF używany do inicjalizacji uwierzytelnienia.                  |
| `context`                    | `ContextIdentifier`   | Kontekst uwierzytelnienia, np. `{ type: "Nip", value: "5265877635" }`. |
| `authorizationPolicy`        | `AuthorizationPolicy` | Opcjonalna polityka IP przekazywana do `/auth/ksef-token`.             |
| `pollIntervalMs`             | `number`              | Interwał odpytywania statusu uwierzytelnienia.                         |
| `maxAttempts`                | `number`              | Maksymalna liczba odpytań statusu uwierzytelnienia.                    |
| `publicCertificateBase64Der` | `string`              | Własny certyfikat publiczny KSeF do szyfrowania tokena.                |

## Przykład konfiguracji klienta

```ts
import { KsefClient } from "ksef-client-typescript";

const client = new KsefClient({
  environment: "DEMO",
  timeoutMs: 45_000,
  proxy: process.env.HTTPS_PROXY,
  noProxy: process.env.NO_PROXY,
  headers: { "X-App-Name": "ksef-integration" },
  retryOn429: true,
  maxRetryAttempts: 3,
  maxRetryDelayMs: 10_000,
});
```

## Przykład `KsefClient.connect(...)`

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

## Przykład niestandardowego `baseUrl` i `baseQrUrl`

```ts
import { KsefClient } from "ksef-client-typescript";

const client = new KsefClient({
  baseUrl: "https://api-demo.ksef.mf.gov.pl",
  baseQrUrl: "https://qr-demo.ksef.mf.gov.pl",
});
```
