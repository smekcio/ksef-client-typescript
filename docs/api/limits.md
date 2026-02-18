# Limity (`limits`)

Niskopoziomowy klient dla `/limits/*`, `/rate-limits` oraz testowych endpointów zmiany limitów.

## Dostępne metody

- `getContextLimits()`
- `getSubjectLimits()`
- `getRateLimits()`
- `changeContextSessionLimits(request)`
- `restoreContextSessionLimits()`
- `changeSubjectCertificateLimits(request)`
- `restoreSubjectCertificateLimits()`
- `changeRateLimits(request)`
- `restoreRateLimits()`
- `setRateLimitsProduction(request)`

## Najważniejsze informacje

- `getContextLimits`, `getSubjectLimits` i `getRateLimits` służą do odczytu aktualnych limitów.
- Metody `change*` / `restore*` operują na endpointach testdata i są przeznaczone głównie do scenariuszy testowych.
- Po zakończeniu testów warto przywrócić limity metodami `restore*`.
- `getRateLimits()` odczytuje bieżące limity z `/rate-limits`.
- `changeRateLimits(request)` i `restoreRateLimits()` modyfikują/przywracają limity testowe przez `/testdata/rate-limits`.
- `setRateLimitsProduction(request)` ustawia wartości przez `/testdata/rate-limits/production`.

## Rate-limits w scenariuszach testdata

Scenariusze przygotowania danych testowych mogą łączyć `client.testdata.*` z czasową zmianą limitów przez `client.limits.*`.
Przykładowa sekwencja:

1. ustawienie limitów testowych (`changeRateLimits(...)`),
2. wykonanie operacji testdata (`createSubject(...)`, `createPerson(...)`, `grantPermissions(...)`),
3. przywrócenie limitów (`restoreRateLimits()`).

Powiązane operacje testdata: [testdata.md](testdata.md).

## Przykłady TypeScript

### Odczyt limitów

```ts
const contextLimits = await client.limits.getContextLimits();
const subjectLimits = await client.limits.getSubjectLimits();
const rateLimits = await client.limits.getRateLimits();

console.log({ contextLimits, subjectLimits, rateLimits });
```

### Zmiana i przywrócenie limitu sesji kontekstu

```ts
import { LimitsChangeRequest } from "ksef-client-typescript";

const request: LimitsChangeRequest = {
  // Uzupełnij zgodnie z kontraktem OpenAPI dla /testdata/limits/context/session.
};

await client.limits.changeContextSessionLimits(request);
await client.limits.restoreContextSessionLimits();
```

### Zmiana i przywrócenie limitu certyfikatów podmiotu

```ts
import { LimitsChangeRequest } from "ksef-client-typescript";

const request: LimitsChangeRequest = {
  // Uzupełnij zgodnie z kontraktem OpenAPI dla /testdata/limits/subject/certificate.
};

await client.limits.changeSubjectCertificateLimits(request);
await client.limits.restoreSubjectCertificateLimits();
```

### Zmiana i przywrócenie rate limitów testowych

```ts
import { LimitsChangeRequest } from "ksef-client-typescript";

const request: LimitsChangeRequest = {
  // Uzupełnij zgodnie z kontraktem OpenAPI dla /testdata/rate-limits.
};

await client.limits.changeRateLimits(request);
await client.limits.restoreRateLimits();
```

### Ustawienie produkcyjnych rate limitów przez endpoint testowy

```ts
import { LimitsChangeRequest } from "ksef-client-typescript";

const request: LimitsChangeRequest = {
  // Uzupełnij zgodnie z kontraktem OpenAPI dla /testdata/rate-limits/production.
};

await client.limits.setRateLimitsProduction(request);
```
