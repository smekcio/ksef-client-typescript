# Dane testowe (`testdata`)

Niskopoziomowy klient dla endpointów `/testdata/*`.

Endpointy testdata są przeznaczone dla środowisk testowych (`TEST` i `DEMO`) do przygotowania danych oraz scenariuszy integracyjnych.

## Dostępne metody

- `enableAttachments(request)`
- `revokeAttachments(request)`
- `grantPermissions(request)`
- `revokePermissions(request)`
- `blockContext(request)`
- `unblockContext(request)`
- `createPerson(request)`
- `removePerson(request)`
- `createSubject(request)`
- `removeSubject(request)`
- `updateCertificate(serialNumber, request)`

## Najważniejsze informacje

- Wszystkie metody tego klienta używają `accessToken`.
- `blockContext(...)` i `unblockContext(...)` przyjmują `contextIdentifier`.
- Dozwolone typy `contextIdentifier.type` to: `Nip`, `InternalId`, `NipVatUe`, `PeppolId`.
- `updateCertificate(serialNumber, { validTo })` skróca okres ważności certyfikatu KSeF na środowiskach testowych (`PUT /testdata/certificates/{serialNumber}`); `serialNumber` musi mieć format `^[0-9A-F]{16}$`.
- Operacje na endpointach `/testdata/limits/*` oraz `/testdata/rate-limits*` nie są realizowane przez `client.testdata`; obsługuje je `client.limits`.
- `changeContextSessionLimits(...)` na TEST ustawia też `collectiveIdentifier.maxInvoices`.

## Operacje limit/rate-limit (klient `limits`)

W scenariuszach testowych, w których trzeba zmienić limity lub rate-limity, użyj metod klienta `limits`:

- `client.limits.changeContextSessionLimits(request)` / `client.limits.restoreContextSessionLimits()`
- `client.limits.changeSubjectCertificateLimits(request)` / `client.limits.restoreSubjectCertificateLimits()`
- `client.limits.changeRateLimits(request)` / `client.limits.restoreRateLimits()`
- `client.limits.setRateLimitsProduction(request)`

Szczegóły i przykłady: [limits.md](limits.md).

## Przykłady TypeScript

### Tworzenie i usuwanie podmiotu testowego

```ts
import { TestdataRequest } from "ksef-client-typescript";

const createSubjectRequest: TestdataRequest = {
  // Uzupełnij zgodnie z kontraktem OpenAPI dla /testdata/subject.
};

const removeSubjectRequest: TestdataRequest = {
  // Uzupełnij zgodnie z kontraktem OpenAPI dla /testdata/subject/remove.
};

await client.testdata.createSubject(createSubjectRequest);
await client.testdata.removeSubject(removeSubjectRequest);
```

### Tworzenie i usuwanie osoby testowej

```ts
import { TestdataRequest } from "ksef-client-typescript";

const createPersonRequest: TestdataRequest = {
  // Uzupełnij zgodnie z kontraktem OpenAPI dla /testdata/person.
};

const removePersonRequest: TestdataRequest = {
  // Uzupełnij zgodnie z kontraktem OpenAPI dla /testdata/person/remove.
};

await client.testdata.createPerson(createPersonRequest);
await client.testdata.removePerson(removePersonRequest);
```

### Nadanie i cofnięcie uprawnień testowych

```ts
import { TestdataRequest } from "ksef-client-typescript";

const grantRequest: TestdataRequest = {
  // Uzupełnij zgodnie z kontraktem OpenAPI dla /testdata/permissions.
};

const revokeRequest: TestdataRequest = {
  // Uzupełnij zgodnie z kontraktem OpenAPI dla /testdata/permissions/revoke.
};

await client.testdata.grantPermissions(grantRequest);
await client.testdata.revokePermissions(revokeRequest);
```

### Blokada i odblokowanie kontekstu dla `Nip`

```ts
await client.testdata.blockContext({
  contextIdentifier: { type: "Nip", value: "5265877635" },
});

await client.testdata.unblockContext({
  contextIdentifier: { type: "Nip", value: "5265877635" },
});
```

### Blokada i odblokowanie kontekstu dla `InternalId`

```ts
await client.testdata.blockContext({
  contextIdentifier: { type: "InternalId", value: "UNIT-ABC-001" },
});

await client.testdata.unblockContext({
  contextIdentifier: { type: "InternalId", value: "UNIT-ABC-001" },
});
```

### Włączenie i cofnięcie prawa do załączników

```ts
import { TestdataRequest } from "ksef-client-typescript";

const enableRequest: TestdataRequest = {
  // Uzupełnij zgodnie z kontraktem OpenAPI dla /testdata/attachment.
};

const revokeRequest: TestdataRequest = {
  // Uzupełnij zgodnie z kontraktem OpenAPI dla /testdata/attachment/revoke.
};

await client.testdata.enableAttachments(enableRequest);
await client.testdata.revokeAttachments(revokeRequest);
```

### Skrócenie ważności certyfikatu testowego

```ts
await client.testdata.updateCertificate("0123456789ABCDEF", {
  validTo: "2026-12-31T23:59:59Z",
});
```
