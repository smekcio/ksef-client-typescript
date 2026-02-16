# Peppol

Thin client dla `/peppol/query`.

## Metody

- `queryProviders(pageOffset?, pageSize?)`

## Co warto wiedziec

- Endpoint nie wymaga `accessToken` (analogicznie do `security`).
- Endpoint zwraca liste dostawcow Peppol i obsluguje paginacje offsetowa.
- W odroznieniu od Python SDK, TypeScript klient uzywa nazwy `queryProviders(...)`.
- Odpowiedz ma charakter forward-compatible (`JsonObject`), wiec pola odczytuj defensywnie.

## Przyklad 1: pobranie pierwszej strony

```ts
const providers = await client.peppol.queryProviders(0, 50);
console.log(providers);
```

## Przyklad 2: iteracja po stronach

```ts
let pageOffset = 0;
const pageSize = 100;

for (;;) {
  const page = await client.peppol.queryProviders(pageOffset, pageSize);
  const items =
    typeof page === "object" && page !== null && Array.isArray((page as { items?: unknown[] }).items)
      ? ((page as { items?: unknown[] }).items ?? [])
      : [];

  if (items.length === 0) {
    break;
  }

  console.log("Fetched providers:", items.length, "offset:", pageOffset);
  pageOffset += pageSize;
}
```
