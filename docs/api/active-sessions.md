# Active sessions

Thin client dla `/auth/sessions`.

## Metody

- `listActiveSessions(pageSize?, continuationToken?)`
- `revokeCurrentSession()`
- `revokeSession(referenceNumber)`

## Przyklad

```ts
const list = await client.activeSessions.listActiveSessions(100);

if (list.sessions?.length) {
  await client.activeSessions.revokeSession(list.sessions[0].referenceNumber);
}
```
