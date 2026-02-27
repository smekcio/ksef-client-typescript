# API Lighthouse (Latarnia KSeF)

Latarnia KSeF udostepnia status dostepnosci API i komunikaty utrzymaniowe.

W SDK dostepne sa typy dla odpowiedzi latarni:

- `LighthouseStatusResponse`
- `LighthouseMessage`
- `LighthouseStatusCode`

Plik z typami: `src/types/lighthouse.ts`.

Adresy bazowe latarni:

- `TEST`: `https://api-latarnia-test.ksef.mf.gov.pl`
- `PRD`/`PROD`: `https://api-latarnia.ksef.mf.gov.pl`

Mapowanie znajduje sie w `KSEF_LIGHTHOUSE_URLS` (`src/types/common.ts`).

## Przykladowe zapytania

```bash
curl -sS https://api-latarnia-test.ksef.mf.gov.pl/api/status
curl -sS https://api-latarnia.ksef.mf.gov.pl/api/status
```

## Uzycie typow

```ts
import type { LighthouseStatusResponse } from "ksef-client";

function isAvailable(status: LighthouseStatusResponse): boolean {
  return status.status === "AVAILABLE";
}
```

## Uwagi

- W tym repozytorium nie ma dedykowanego klienta HTTP dla latarni.
- Do sprawdzenia statusu mozna uzyc `fetch`/`undici` lub zewnetrznego monitora.
