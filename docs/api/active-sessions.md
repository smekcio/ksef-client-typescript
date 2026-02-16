# Active sessions

Thin client dla `/auth/sessions`.

## Metody

- `listActiveSessions(pageSize?, continuationToken?)`
- `revokeCurrentSession()`
- `revokeSession(referenceNumber)`

## Co warto wiedziec

- Endpointy aktywnych sesji wymagaja `accessToken`.
- Stronicowanie korzysta z naglowka `x-continuation-token`.
- Odpowiedz jest forward-compatible (`JsonObject`), dlatego pola warto odczytywac defensywnie.

## Przyklad 1: listowanie i defensywna obsluga odpowiedzi

```ts
const list = await client.activeSessions.listActiveSessions(100);
const sessions =
  typeof list === "object" && list !== null && Array.isArray((list as { sessions?: unknown[] }).sessions)
    ? ((list as { sessions?: unknown[] }).sessions ?? [])
    : [];

console.log("Active sessions:", sessions.length);
```

## Przyklad 2: pobranie kolejnej strony

```ts
const firstPage = await client.activeSessions.listActiveSessions(50);
const continuation =
  typeof firstPage === "object" && firstPage !== null
    ? ((firstPage as { continuationToken?: string }).continuationToken ?? undefined)
    : undefined;

if (continuation) {
  const secondPage = await client.activeSessions.listActiveSessions(50, continuation);
  console.log(secondPage);
}
```

## Przyklad 3: revoke jednej sesji

```ts
const list = await client.activeSessions.listActiveSessions(100);
const sessions =
  typeof list === "object" && list !== null
    ? ((list as { sessions?: Array<{ referenceNumber?: string }> }).sessions ?? [])
    : [];

if (sessions.length > 0 && sessions[0].referenceNumber) {
  await client.activeSessions.revokeSession(sessions[0].referenceNumber);
}
```

## Przyklad 4: revoke biezacej sesji

```ts
await client.activeSessions.revokeCurrentSession();
```
