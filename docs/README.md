# KSeF TypeScript SDK – dokumentacja

Dokumentacja opisuje publiczne API biblioteki `ksef-client-typescript` oraz gotowe workflowy dla najczęstszych procesów: uwierzytelniania, sesji wysyłkowych i eksportu faktur.

Kontrakt API (OpenAPI), dokumenty procesowe i ograniczenia systemu znajdują się w `ksef-docs/`.

Kompatybilność SDK: **KSeF API `v2.6.0`**.

## Status parity

Aktualny status zgodności SDK względem `ksef-docs` znajdziesz w raporcie:
[parity-ksef-docs.md](parity-ksef-docs.md).

## Wymagania

- Node.js `>= 20`
- dostęp do środowiska KSeF (`TEST`, `DEMO`, `PRD`)
- dane uwierzytelniające (token KSeF lub certyfikat/XAdES)
- opcjonalnie `qrcode`, `node-forge` i `libxmljs2` dla QR, PKCS#12/XAdES i runtime walidacji XSD FA(3)

## Instalacja (lokalnie)

W katalogu projektu:

```bash
npm install
```

Budowanie biblioteki:

```bash
npm run build
```

## Struktura SDK

Biblioteka udostępnia dwa poziomy użycia:

1. **Klienci API (cienka warstwa)** – `KsefClient` i podklienci (`client.auth`, `client.sessions`, `client.invoices`, ...). Metody odpowiadają endpointom KSeF i zwracają odpowiedzi typowane.
2. **Workflowy i usługi** – `client.workflows.*` oraz usługi pomocnicze (`client.verificationLinks`, `client.qr`, `client.personToken`). Ta warstwa łączy wiele wywołań API z operacjami lokalnymi (szyfrowanie, podpis, ZIP).

## Nawigacja

- [Start](getting-started.md)
- [Konfiguracja klienta](configuration.md)
- [Błędy i retry](errors.md)

**Referencja API (endpointy):**

- [`KsefClient`](api/client.md)
- [`client.auth`](api/auth.md)
- [`client.activeSessions`](api/active-sessions.md)
- [`client.sessions`](api/sessions.md)
- [`client.invoices`](api/invoices.md)
- [`client.permissions`](api/permissions.md)
- [`client.certificates`](api/certificates.md)
- [`client.tokens`](api/tokens.md)
- [`client.limits` (limits + rate limits)](api/limits.md)
- [`client.security`](api/security.md)
- [`client.testdata`](api/testdata.md)
- [`client.peppol`](api/peppol.md)

**Workflows:**

- [Uwierzytelnianie](workflows/auth.md)
- [Sesja interaktywna (online)](workflows/online-session.md)
- [Sesja wsadowa (batch)](workflows/batch-session.md)
- [Eksport faktur](workflows/export.md)

**Usługi i narzędzia:**

- [Usługi (`services`)](services/README.md)
- [Utils (`utils`)](utils/README.md)

**Przykłady:**

- [Przykłady](examples/README.md)

**Utrzymanie repozytorium:**

- [Maintainers guide](maintainers.md)
