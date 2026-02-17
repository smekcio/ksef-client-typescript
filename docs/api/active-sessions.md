# Active sessions

Thin client dla `/auth/sessions`.

## Metody

- `listActiveSessions(pageSize?, continuationToken?)`
- `revokeCurrentSession()`
- `revokeSession(referenceNumber)`

## Co warto wiedziec

- Endpointy aktywnych sesji wymagaja `accessToken`.
- Stronicowanie korzysta z naglowka `x-continuation-token`.
- Odpowiedz ma typ `AuthenticationListResponse`.
- W pojedynczym wpisie sesji (`AuthenticationListItem`) pole `authenticationMethod` jest deprecated.
- Preferowany opis metody auth to `authenticationMethodInfo` (`category`, `code`, `displayName`).

## Struktura odpowiedzi

```ts
const list = await client.activeSessions.listActiveSessions(100);
console.log(list.continuationToken);
console.log(list.items.length);

for (const item of list.items) {
  console.log(item.referenceNumber);
  console.log(item.authenticationMethodInfo.category); // XadesSignature | NationalNode | Token | Other
  console.log(item.authenticationMethodInfo.code);
  console.log(item.authenticationMethodInfo.displayName);
  console.log(item.authenticationMethod); // deprecated
}
```

## Przyklad 2: pobranie kolejnej strony

```ts
const firstPage = await client.activeSessions.listActiveSessions(50);
const continuation = firstPage.continuationToken;

if (continuation) {
  const secondPage = await client.activeSessions.listActiveSessions(50, continuation);
  console.log(secondPage);
}
```

## Przyklad 3: revoke jednej sesji

```ts
const list = await client.activeSessions.listActiveSessions(100);
const sessions = list.items;

if (sessions.length > 0 && sessions[0].referenceNumber) {
  await client.activeSessions.revokeSession(sessions[0].referenceNumber);
}
```

## Przyklad 4: revoke biezacej sesji

```ts
await client.activeSessions.revokeCurrentSession();
```
