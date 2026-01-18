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

## Przyklad

```ts
const limits = await client.limits.getRateLimits();
console.log(limits);
```
