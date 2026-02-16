# Limits

Thin client dla `/limits/*` i `/rate-limits` + testdata limity.

## Metody

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

## Co warto wiedziec

- `getContextLimits`, `getSubjectLimits`, `getRateLimits` to odczyt limitow produkcyjnych/testowych.
- Endpointy `/testdata/*` sluza do czasowej zmiany limitow w scenariuszach testowych.
- Po testach warto przywrocic domyslne limity (`restore*`), aby nie zostawic zmodyfikowanego srodowiska.

## Przyklad 1: odczyt limitow

```ts
const contextLimits = await client.limits.getContextLimits();
const subjectLimits = await client.limits.getSubjectLimits();
const rateLimits = await client.limits.getRateLimits();

console.log({ contextLimits, subjectLimits, rateLimits });
```

## Przyklad 2: zmiana i przywrocenie limitu sesji (testdata)

```ts
await client.limits.changeContextSessionLimits({
  // payload zgodny z kontraktem API
  maxRequestsPerMinute: 30,
});

// ... testy integracyjne ...

await client.limits.restoreContextSessionLimits();
```

## Przyklad 3: zmiana i przywrocenie limitu certyfikatow (testdata)

```ts
await client.limits.changeSubjectCertificateLimits({
  maxCertificates: 20,
});

await client.limits.restoreSubjectCertificateLimits();
```

## Przyklad 4: zmiana i restore rate-limits

```ts
await client.limits.changeRateLimits({
  requestsPerMinute: 100,
});

await client.limits.restoreRateLimits();
```

## Przyklad 5: ustawienie rate-limits produkcyjnych (test endpoint)

```ts
await client.limits.setRateLimitsProduction({
  requestsPerMinute: 500,
});
```
