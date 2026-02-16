# Testdata

Thin client dla `/testdata/*`.

Endpointy sa przeznaczone do srodowisk testowych (TEST/DEMO), np. do przygotowania danych, uprawnien i scenariuszy testowych.

## Metody

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

## Co warto wiedziec

- `blockContext(...)` i `unblockContext(...)` przyjmuja `contextIdentifier` z typem:
  - `Nip`
  - `InternalId`
  - `NipVatUe`
  - `PeppolId`
- Dla wiekszosci wywolan wymagany jest aktywny `accessToken`.

## Przyklad 1: create/remove subject

```ts
await client.testdata.createSubject({
  // Przykladowy payload - dopasuj do kontraktu POST /testdata/subject.
  subject: {
    identifier: { type: "Nip", value: "5265877635" },
    name: "Test Subject",
  },
});

await client.testdata.removeSubject({
  subject: {
    identifier: { type: "Nip", value: "5265877635" },
  },
});
```

## Przyklad 2: create/remove person

```ts
await client.testdata.createPerson({
  // Przykladowy payload - dopasuj do kontraktu POST /testdata/person.
  person: {
    firstName: "Jan",
    lastName: "Kowalski",
    pesel: "90010112345",
  },
});

await client.testdata.removePerson({
  person: {
    pesel: "90010112345",
  },
});
```

## Przyklad 3: grant/revoke test permissions

```ts
await client.testdata.grantPermissions({
  // Przykladowy payload - dopasuj do kontraktu POST /testdata/permissions.
  permissions: [{ permission: "InvoiceRead", assignee: "90010112345" }],
});

await client.testdata.revokePermissions({
  permissions: [{ permission: "InvoiceRead", assignee: "90010112345" }],
});
```

## Przyklad 4: block/unblock context dla `Nip`

```ts
await client.testdata.blockContext({
  contextIdentifier: { type: "Nip", value: "5265877635" },
});

await client.testdata.unblockContext({
  contextIdentifier: { type: "Nip", value: "5265877635" },
});
```

## Przyklad 5: block/unblock context dla `InternalId`

```ts
await client.testdata.blockContext({
  contextIdentifier: { type: "InternalId", value: "UNIT-ABC-001" },
});

await client.testdata.unblockContext({
  contextIdentifier: { type: "InternalId", value: "UNIT-ABC-001" },
});
```

## Przyklad 6: enable/revoke attachments

```ts
await client.testdata.enableAttachments({
  // Przykladowy payload - dopasuj do kontraktu POST /testdata/attachment.
  contextIdentifier: { type: "Nip", value: "5265877635" },
});

await client.testdata.revokeAttachments({
  contextIdentifier: { type: "Nip", value: "5265877635" },
});
```
