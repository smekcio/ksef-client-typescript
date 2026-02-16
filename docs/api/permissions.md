# Permissions

Thin client dla `/permissions/*`.

## Metody

- Nadawanie:
  - `grantAuthorizations(request)`
  - `grantEntities(request)`
  - `grantEuEntitiesAdministration(request)`
  - `grantEuEntities(request)`
  - `grantIndirect(request)`
  - `grantPersons(request)`
  - `grantSubunits(request)`
- Cofanie:
  - `revokeAuthorizationGrant(permissionId)`
  - `revokeCommonGrant(permissionId)`
- Query:
  - `queryAuthorizations(request, pageOffset?, pageSize?)`
  - `queryEntitiesRoles(pageOffset?, pageSize?)`
  - `queryEuEntitiesGrants(request, pageOffset?, pageSize?)`
  - `queryPersonalGrants(request, pageOffset?, pageSize?)`
  - `queryPersonsGrants(request, pageOffset?, pageSize?)`
  - `querySubordinateEntitiesRoles(request, pageOffset?, pageSize?)`
  - `querySubunitsGrants(request, pageOffset?, pageSize?)`
- Statusy:
  - `getAttachmentPermissionStatus()`
  - `getOperationStatus(referenceNumber)`

## Co warto wiedziec

- Wiekszosc operacji `grant*` jest asynchroniczna (`202`) i zwraca numer referencyjny operacji.
- Po `grant*` warto odpytywac `getOperationStatus(...)` do momentu `status.code === 200`.
- Payloady sa przekazywane jako obiekty JSON zgodne z kontraktem KSeF (OpenAPI/XSD w `ksef-docs`).
- Dla metod `query*` paginacja (`pageOffset`, `pageSize`) jest przekazywana jako query parametry HTTP.

## Przyklad 1: grant + polling statusu operacji

```ts
const request = {
  // Przykladowy payload - dopasuj do kontraktu /permissions/persons/grants.
  grants: [
    {
      permission: "InvoiceRead",
      personIdentifier: { type: "Pesel", value: "90010112345" },
    },
  ],
};

const op = await client.permissions.grantPersons(request);
const referenceNumber = String(op.referenceNumber ?? "");

for (let attempt = 0; attempt < 60; attempt += 1) {
  const status = await client.permissions.getOperationStatus(referenceNumber);
  const code = Number((status as { status?: { code?: number } }).status?.code ?? 0);
  if (code === 200) {
    break;
  }
  if (code !== 100) {
    throw new Error(`Permissions operation failed: ${JSON.stringify(status)}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
```

## Przyklad 2: query persons grants

```ts
const result = await client.permissions.queryPersonsGrants({
  // Dalsze filtry wedlug kontraktu KSeF.
}, 0, 20);

console.log(result);
```

## Przyklad 3: check attachment permission status

```ts
const attachmentStatus = await client.permissions.getAttachmentPermissionStatus();
console.log(attachmentStatus);
```

## Przyklad 4: revoke grant

```ts
await client.permissions.revokeAuthorizationGrant("PERMISSION_ID");
await client.permissions.revokeCommonGrant("PERMISSION_ID");
```

## Przyklad 5: roles query

```ts
const entityRoles = await client.permissions.queryEntitiesRoles(0, 50);

const subordinateRoles = await client.permissions.querySubordinateEntitiesRoles({
  // body query
}, 0, 50);

console.log(entityRoles, subordinateRoles);
```
