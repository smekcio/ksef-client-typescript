# Aktywne sesje (`activeSessions`)

Niskopoziomowy klient dla endpointów `/auth/sessions`.

## Dostępne metody

- `listActiveSessions(pageSize?, continuationToken?)`
- `revokeCurrentSession()`
- `revokeSession(referenceNumber)`

## Najważniejsze informacje

- Wszystkie metody wymagają aktywnego `accessToken`.
- Stronicowanie działa przez nagłówek `x-continuation-token`.
- `listActiveSessions` zwraca `AuthenticationListResponse`.
- Pole `authenticationMethod` jest oznaczone jako przestarzałe; używaj `authenticationMethodInfo`.

## Przykłady TypeScript

### Pobranie listy aktywnych sesji

```ts
const list = await client.activeSessions.listActiveSessions(100);

console.log("continuationToken:", list.continuationToken);
console.log("liczba sesji:", list.items.length);

for (const item of list.items) {
  console.log(item.referenceNumber);
  console.log(item.authenticationMethodInfo.category); // XadesSignature | NationalNode | Token | Other
  console.log(item.authenticationMethodInfo.code);
  console.log(item.authenticationMethodInfo.displayName);
}
```

### Pobranie kolejnej strony

```ts
const firstPage = await client.activeSessions.listActiveSessions(50);

if (firstPage.continuationToken) {
  const secondPage = await client.activeSessions.listActiveSessions(
    50,
    firstPage.continuationToken,
  );
  console.log(secondPage.items.length);
}
```

### Wycofanie pojedynczej sesji

```ts
const list = await client.activeSessions.listActiveSessions(20);
const session = list.items[0];

if (session?.referenceNumber) {
  await client.activeSessions.revokeSession(session.referenceNumber);
}
```

### Wycofanie bieżącej sesji

```ts
await client.activeSessions.revokeCurrentSession();
```
