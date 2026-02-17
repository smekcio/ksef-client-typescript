# Narzędzia JWT (`jwt`)

Narzędzia do odczytu payloadu JWT bez weryfikacji podpisu.

## API

- `decodeJwtPayload(token: string): JwtPayload | null`
- `getJwtExpiryMs(token: string): number | null`

Typ payloadu eksportowany przez SDK:

```ts
interface JwtPayload {
  exp?: number; // Unix time (sekundy)
}
```

## Przykład

```ts
import { decodeJwtPayload, getJwtExpiryMs } from "ksef-client-typescript";

const payload = decodeJwtPayload(accessToken);
const expiryMs = getJwtExpiryMs(accessToken);

console.log(payload?.exp); // np. 1700000000
console.log(expiryMs); // np. 1700000000000
```

## Uwagi operacyjne

- `decodeJwtPayload(...)` zwraca `null` dla niepoprawnego formatu tokena lub niepoprawnego JSON payloadu.
- `getJwtExpiryMs(...)` zwraca `null`, gdy `exp` nie występuje (albo payload nie daje się zdekodować).
- Funkcje są przeznaczone do odczytu informacji lokalnie; nie zastępują pełnej walidacji JWT.
