# Workflowy

Workflowy to gotowe scenariusze, które łączą endpointy API KSeF z operacjami lokalnymi
(kryptografia, ZIP, upload/download partów, polling statusów).

W TypeScript są dostępne pod `client.workflows`.

## Dostępne workflowy

- [Uwierzytelnianie (token KSeF / XAdES)](auth.md)
- [Sesja interaktywna (open -> send -> close -> UPO)](online-session.md)
- [Sesja wsadowa (ZIP -> podział -> szyfrowanie -> upload -> close)](batch-session.md)
- [Tryb offline (offline24 / offline / awaryjny)](offline.md)
- [Eksport paczek i eksport przyrostowy](export.md)

## Kiedy workflow, a kiedy thin API

- Użyj workflow, gdy chcesz gotowy proces end-to-end z sensownymi domyślnymi ustawieniami.
- Użyj thin API (`client.auth`, `client.sessions`, `client.invoices`), gdy potrzebujesz pełnej kontroli nad każdym requestem i pollingiem.

## Wspólne założenia

- Workflowy sesji, eksportu i offline wymagają ustawionego `accessToken` w `authManager`.
- Najkrótsza ścieżka to `KsefClient.connect(...)`, który uruchamia tokenowy workflow auth i zapisuje tokeny.
- W przypadku manualnego auth ustaw tokeny przez `client.authManager.setTokens(...)`.

```ts
import { KsefClient } from "ksef-client-typescript";

const client = await KsefClient.connect({
  environment: "DEMO",
  token: process.env.KSEF_TOKEN!,
  context: { type: "Nip", value: process.env.KSEF_NIP ?? "5265877635" },
  pollIntervalMs: 2000,
  maxAttempts: 90,
});
```

## Szybki wybór workflowu

| Potrzeba | Workflow |
| --- | --- |
| Uzyskanie tokenów (`accessToken`, `refreshToken`) | `client.workflows.auth.*` |
| Wysyłka pojedynczych faktur w sesji online | `client.workflows.sessions.online.*` |
| Wysyłka paczki faktur jako ZIP | `client.workflows.sessions.batch.openUploadAndClose(...)` |
| Wysyłka faktury z `offlineMode=true` + instrukcje operacyjne | `client.workflows.offline.*` |
| Eksport i obróbka paczek faktur | `client.workflows.exports.*` |
| Eksport przyrostowy z continuation points | `client.workflows.exportsIncremental.run(...)` |

## Powiązane dokumenty

- API reference: [../api/README.md](../api/README.md)
- Praktyczne fragmenty kodu: [../examples/README.md](../examples/README.md)
- Błędy i retry: [../errors.md](../errors.md)
