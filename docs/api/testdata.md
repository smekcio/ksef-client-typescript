# Testdata

Thin client dla `/testdata/*`.

## Metody

- `enableAttachments(request)`
- `revokeAttachments(request)`
- `grantPermissions(request)`
- `revokePermissions(request)`
- `createPerson(request)`
- `removePerson(request)`
- `createSubject(request)`
- `removeSubject(request)`

## Przyklad

```ts
await client.testdata.createSubject({ subject: { nip: "5265877635" } });
await client.testdata.createPerson({ person: { pesel: "11111111111" } });
```
