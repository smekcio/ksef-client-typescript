# KsefClient (glowny klient)

`KsefClient` grupuje wszystkie podklienci API oraz udostepnia `workflows` i pomocnicze services.

## Inicjalizacja

```ts
import { KsefClient } from "ksef-client-typescript";

const client = new KsefClient({
  environment: "DEMO",
});
```

## Connect (token KSeF)

```ts
const client = await KsefClient.connect({
  environment: "DEMO",
  token: process.env.KSEF_TOKEN!,
  context: { type: "Nip", value: "5265877635" },
});
```

## Dostepne pola

- `client.auth`, `client.sessions`, ... (thin API)
- `client.workflows.auth` - AuthCoordinator
- `client.workflows.sessions.online` - OnlineSessionWorkflow
- `client.workflows.sessions.batch` - BatchSessionWorkflow
- `client.workflows.exports` - InvoiceExportWorkflow
- `client.workflows.exportsIncremental` - IncrementalExportWorkflow
- `client.verificationLinks` - linki QR
- `client.qr` - generowanie PNG/SVG/Data URL (wymaga `qrcode`)
- `client.personToken` - parser JWT tokena osoby
