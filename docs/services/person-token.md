# Person token (`PersonTokenService`)

`PersonTokenService` służy do inspekcji claimów JWT dla person tokenów KSeF.

## Ważne ograniczenie bezpieczeństwa

Parser nie weryfikuje podpisu JWT. Używaj go wyłącznie do diagnostyki/prezentacji danych tokenów, którym już ufasz.

## `PersonTokenService.parse(jwtToken) -> PersonToken`

Zwraca ujednoliconą strukturę m.in. z polami:
- `issuer`, `audiences`
- `issuedAt`, `expiresAt`
- `roles`, `permissions`, `permissionsExcluded`, `permissionsEffective`
- `contextIdType`, `contextIdValue`
- `subjectDetails`, `ipPolicy`
- `authMethod`, `authRequestNumber`

Przykład:

```ts
import { PersonTokenService } from "ksef-client-typescript";

const parsed = new PersonTokenService().parse(jwtToken);

console.log(parsed.contextIdType, parsed.contextIdValue);
console.log(parsed.roles);
```
