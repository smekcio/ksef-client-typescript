# API (endpointy) – referencja

Ta część dokumentacji opisuje metody dostępne w podklientach `KsefClient`.

Podklienci stanowią cienką warstwę nad HTTP: mapują metody bezpośrednio na endpointy KSeF i zwracają odpowiedzi typowane zgodnie z modelami SDK.

Dla scenariuszy wieloetapowych (uwierzytelnianie, sesje, eksport) używaj warstwy workflow: [`../workflows/README.md`](../workflows/README.md).

## Strony

- [`KsefClient`](client.md)
- [`client.auth`](auth.md)
- [`API Lighthouse (status systemu)`](lighthouse.md)
- [`client.activeSessions`](active-sessions.md)
- [`client.sessions`](sessions.md)
- [`client.invoices`](invoices.md)
- [`client.permissions`](permissions.md)
- [`client.certificates`](certificates.md)
- [`client.tokens`](tokens.md)
- [`client.limits`](limits.md)
- [`client.security`](security.md)
- [`client.testdata`](testdata.md)
- [`client.peppol`](peppol.md)
- [`Modele OpenAPI (plik generowany)`](../../src/types/openapi.generated.ts)
