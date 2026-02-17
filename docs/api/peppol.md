# Peppol (`peppol`)

Niskopoziomowy klient dla endpointu `/peppol/query`.

## Dostępne metody

- `queryProviders(pageOffset?, pageSize?)`

## Najważniejsze informacje

- Endpoint nie wymaga `accessToken` (potwierdzone testami jednostkowymi).
- `queryProviders(...)` obsługuje paginację offsetową (`pageOffset`, `pageSize`).
- Odpowiedź ma typ `JsonObject`, dlatego odczyt pól warto wykonywać defensywnie.

## Przykłady TypeScript

### Pobranie pierwszej strony

```ts
const providers = await client.peppol.queryProviders(0, 50);
console.log(providers);
```

### Iteracja po stronach

```ts
let pageOffset = 0;
const pageSize = 100;

for (;;) {
  const page = await client.peppol.queryProviders(pageOffset, pageSize);
  const items =
    typeof page === "object" &&
    page !== null &&
    Array.isArray((page as { items?: unknown[] }).items)
      ? ((page as { items?: unknown[] }).items ?? [])
      : [];

  if (items.length === 0) {
    break;
  }

  console.log("Pobrano dostawców:", items.length, "offset:", pageOffset);
  pageOffset += pageSize;
}
```
