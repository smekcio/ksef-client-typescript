# KSeF TypeScript SDK - dokumentacja

Dokumentacja opisuje publiczne API biblioteki `ksef-client-typescript` oraz scenariusze workflow (auth, sesje, eksport). Kontrakty API i schemy XSD znajduja sie w `ksef-docs/`.

## Wymagania

- Node.js >= 20
- Dostep do srodowiska KSeF (TEST/DEMO/PRD) oraz dane uwierzytelniajace

## Struktura SDK

Biblioteka udostepnia dwa poziomy uzycia:

1. **Thin API clients** - `KsefClient` + podklienci (`client.auth`, `client.sessions`, ...). Metody odpowiadaja endpointom KSeF.
2. **Workflows** - gotowe scenariusze w `client.workflows` oraz `services/*` (np. `OnlineSessionWorkflow`, `BatchSessionWorkflow`, `InvoiceExportWorkflow`).

## Nawigacja

- [Start](getting-started.md)
- [Konfiguracja klienta](configuration.md)
- [Bledy i retry](errors.md)

**API (thin clients):**

- [KsefClient](api/client.md)
- [Auth](api/auth.md)
- [Active sessions](api/active-sessions.md)
- [Sessions](api/sessions.md)
- [Invoices](api/invoices.md)
- [Permissions](api/permissions.md)
- [Certificates](api/certificates.md)
- [Tokens](api/tokens.md)
- [Limits](api/limits.md)
- [Security](api/security.md)
- [Testdata](api/testdata.md)
- [Peppol](api/peppol.md)

**Workflows:**

- [Uwierzytelnianie](workflows/auth.md)
- [Sesja interaktywna](workflows/online-session.md)
- [Sesja wsadowa](workflows/batch-session.md)
- [Eksport paczek](workflows/export.md)

**Services / Utils / XML:**

- [Services](services/README.md)
- [Utils](utils/README.md)
- [XML](xml/README.md)

**Przyklady:**

- [Przyklady](examples/README.md)
