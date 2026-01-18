# Permissions

Thin client dla `/permissions/*`.

## Metody (wybrane)

- `grantAuthorizations(request)`
- `grantEntities(request)`
- `grantEuEntitiesAdministration(request)`
- `grantEuEntities(request)`
- `grantIndirect(request)`
- `grantPersons(request)`
- `grantSubunits(request)`
- `revokeAuthorizationGrant(permissionId)`
- `revokeCommonGrant(permissionId)`
- `queryAuthorizations(request)`
- `queryEntitiesRoles()`
- `queryEuEntitiesGrants(request)`
- `queryPersonalGrants(request)`
- `queryPersonsGrants(request)`
- `querySubordinateEntitiesRoles(request)`
- `querySubunitsGrants(request)`
- `getAttachmentPermissionStatus()`
- `getOperationStatus(referenceNumber)`

## Przyklad

```ts
const op = await client.permissions.grantPersons({
  permissions: ["invoice:read"],
  persons: [{ nip: "5265877635" }],
});

const status = await client.permissions.getOperationStatus(op.referenceNumber);
```
