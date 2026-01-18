# API (thin clients)

Kazdy podklient odpowiada tagowi z OpenAPI. Metody mapuja sie bezposrednio na endpointy KSeF.

Podklienci dostepni z `KsefClient`:

- `client.auth`
- `client.activeSessions`
- `client.sessions`
- `client.invoices`
- `client.permissions`
- `client.certificates`
- `client.tokens`
- `client.limits`
- `client.security`
- `client.testdata`
- `client.peppol`

Dla gotowych scenariuszy (auth, sesje, eksport) zobacz `docs/workflows/*`.
