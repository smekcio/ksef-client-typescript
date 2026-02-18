# Uprawnienia (`permissions`)

Niskopoziomowy klient dla endpointów `/permissions/*`.

## Dostępne metody

- `grantAuthorizations(request)`
- `grantEntities(request)`
- `grantEuEntitiesAdministration(request)`
- `grantEuEntities(request)`
- `grantIndirect(request)`
- `grantPersons(request)`
- `grantSubunits(request)`
- `revokeAuthorizationGrant(permissionId)`
- `revokeCommonGrant(permissionId)`
- `queryAuthorizations(request, pageOffset?, pageSize?)`
- `queryEntitiesRoles(pageOffset?, pageSize?)`
- `queryEuEntitiesGrants(request, pageOffset?, pageSize?)`
- `queryPersonalGrants(request, pageOffset?, pageSize?)`
- `queryPersonsGrants(request, pageOffset?, pageSize?)`
- `querySubordinateEntitiesRoles(request, pageOffset?, pageSize?)`
- `querySubunitsGrants(request, pageOffset?, pageSize?)`
- `getAttachmentPermissionStatus()`
- `getOperationStatus(referenceNumber)`

## Najważniejsze informacje

- Operacje `grant*` zwykle są asynchroniczne i zwracają numer referencyjny operacji.
- Status operacji możesz odpytywać przez `getOperationStatus(referenceNumber)`.
- Metody `query*` obsługują paginację przez `pageOffset` i `pageSize` przekazywane jako parametry query.
- `queryEntitiesRoles(...)` to jedyna metoda query oparta o `GET`; pozostałe `query*` używają `POST` z ciałem.

## Przykłady TypeScript

### Nadanie uprawnień i polling statusu

```ts
import { PermissionsGrantRequest } from "ksef-client-typescript";

const request: PermissionsGrantRequest = {
  // Uzupełnij zgodnie z kontraktem OpenAPI dla /permissions/persons/grants.
};

const operation = await client.permissions.grantPersons(request);
const referenceNumber = String((operation as { referenceNumber?: string }).referenceNumber ?? "");

let completed = false;
for (let attempt = 0; attempt < 60; attempt += 1) {
  const status = await client.permissions.getOperationStatus(referenceNumber);
  const code = Number((status as { status?: { code?: number } }).status?.code ?? 0);

  if (code === 200) {
    completed = true;
    break;
  }
  if (code !== 100) {
    throw new Error(`Operacja uprawnień zakończona błędem: ${JSON.stringify(status)}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

if (!completed) {
  throw new Error("Przekroczono czas oczekiwania na zakończenie operacji uprawnień.");
}
```

### Zapytanie o uprawnienia osób z paginacją

```ts
const result = await client.permissions.queryPersonsGrants(
  {
    queryCriteria: {
      personIdentifier: { type: "Pesel", value: "90010112345" },
    },
  },
  0,
  50,
);

console.log(result);
```

### Odczyt statusu uprawnień do załączników

```ts
const attachmentStatus = await client.permissions.getAttachmentPermissionStatus();
console.log(attachmentStatus);
```

### Cofnięcie uprawnienia

```ts
await client.permissions.revokeAuthorizationGrant("PERMISSION_ID");
await client.permissions.revokeCommonGrant("PERMISSION_ID");
```

### Zapytanie o role podmiotów

```ts
const entityRoles = await client.permissions.queryEntitiesRoles(0, 50);

const subordinateRoles = await client.permissions.querySubordinateEntitiesRoles(
  {
    queryCriteria: {},
  },
  0,
  50,
);

console.log(entityRoles, subordinateRoles);
```
