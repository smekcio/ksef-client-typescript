# API Lighthouse (Latarnia KSeF)

Latarnia KSeF udostepnia status dostepnosci API i komunikaty utrzymaniowe.

W SDK dostepny jest dedykowany klient `client.lighthouse` (klasa `LighthouseClient`) oraz typy:

- `LighthouseStatusResponse`
- `LighthouseMessage`
- `LighthouseStatusCode`

Plik z typami: `src/types/lighthouse.ts`.

Endpointy Latarni:

- `GET /status`
- `GET /messages`

Adresy bazowe latarni:

- `TEST`: `https://api-latarnia-test.ksef.mf.gov.pl`
- `PRD`/`PROD`: `https://api-latarnia.ksef.mf.gov.pl`

Mapowanie znajduje sie w `KSEF_LIGHTHOUSE_URLS` (`src/types/common.ts`).

## Uzycie przez SDK

```ts
import { KsefClient } from "ksef-client";

const client = new KsefClient({ environment: "TEST" });
const status = await client.lighthouse.getStatus();
const messages = await client.lighthouse.getMessages();

console.log(status.status);
console.log(messages.length);
```

## Przykladowe zapytania HTTP

```bash
curl -sS https://api-latarnia-test.ksef.mf.gov.pl/status
curl -sS https://api-latarnia.ksef.mf.gov.pl/status
curl -sS https://api-latarnia-test.ksef.mf.gov.pl/messages
```
