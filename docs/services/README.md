# Services

Services to publiczne klasy i funkcje pomocnicze eksportowane z paczki.
Sa przydatne, gdy potrzebujesz wiekszej kontroli niz gotowe `client.workflows.*`.

## Glowna mapa

- Auth:
  - `AuthCoordinator`
  - `buildAuthTokenRequestXml`
  - `XadesKeyPair`
  - `XadesSignatureService`
- Sessions:
  - `OnlineSessionWorkflow`
  - `BatchSessionWorkflow`
  - `OfflineInvoiceWorkflow`
- Export:
  - `InvoiceExportWorkflow`
  - `IncrementalExportWorkflow`
  - `hwmCoordinator` (`updateContinuationPoint`, `getEffectiveStartDate`, `dedupeByKsefNumber`)
- Crypto i dodatkowe:
  - `CryptographyService`
  - `VerificationLinkService`
  - `QrCodeService`
  - `PersonTokenService`

## Przyklad 1: budowanie XML auth do podpisu

```ts
import { buildAuthTokenRequestXml } from "ksef-client-typescript";

const xml = buildAuthTokenRequestXml({
  challenge: "CHALLENGE",
  contextIdentifierType: "Nip",
  contextIdentifierValue: "5265877635",
  subjectIdentifierType: "certificateSubject",
});

console.log(xml);
```

## Przyklad 2: podpis XAdES (enveloped)

```ts
import {
  XadesKeyPair,
  XadesSignatureService,
  buildAuthTokenRequestXml,
} from "ksef-client-typescript";

const xml = buildAuthTokenRequestXml({
  challenge: "CHALLENGE",
  contextIdentifierType: "Nip",
  contextIdentifierValue: "5265877635",
});

const keyPair = XadesKeyPair.fromPem({
  certificatePem: process.env.KSEF_XADES_CERT_PEM!,
  privateKeyPem: process.env.KSEF_XADES_KEY_PEM!,
});

const signedXml = new XadesSignatureService().signXadesEnveloped({ xml, keyPair });
console.log(signedXml.length);
```

## Przyklad 3: HWM deduplikacja i continuation point

```ts
import {
  dedupeByKsefNumber,
  getEffectiveStartDate,
  updateContinuationPoint,
} from "ksef-client-typescript";

const continuationPoints: Record<string, string | undefined> = {};

updateContinuationPoint(continuationPoints, "Subject1", {
  isTruncated: true,
  lastPermanentStorageDate: "2025-01-10T12:00:00Z",
});

const from = getEffectiveStartDate(continuationPoints, "Subject1", "2025-01-01");
console.log(from);

const deduped = dedupeByKsefNumber([
  { ksefNumber: "ABC", amount: 1 },
  { ksefNumber: "abc", amount: 2 },
  { ksefNumber: "XYZ", amount: 3 },
]);

console.log(Object.keys(deduped)); // ["ABC", "XYZ"]
```

## Przyklad 4: link weryfikacyjny + QR

```ts
import { VerificationLinkService, QrCodeService } from "ksef-client-typescript";

const verification = new VerificationLinkService({
  baseQrUrl: "https://qr-demo.ksef.mf.gov.pl",
});

const url = verification.buildInvoiceVerificationUrl(
  "5265877635",
  "01-01-2025",
  "BASE64_HASH",
);

const qr = new QrCodeService();
const dataUrl = await qr.generateSvgDataUrl(url);

console.log(url, dataUrl.slice(0, 64));
```

## Przyklad 5: gotowy flow offline

```ts
import { OfflineInvoiceWorkflow } from "ksef-client-typescript";

const offlineWorkflow = new OfflineInvoiceWorkflow(client.workflows.sessions.online);
const result = await offlineWorkflow.sendOfflineInvoice({
  formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
  invoice: "<Faktura>...</Faktura>",
  waitForUpo: false,
});

console.log(result.invoiceReferenceNumber);
```

## Strony szczegolowe

- [Workflows](workflows.md)
- [Auth](auth.md)
- [Crypto](crypto.md)
- [HWM](hwm.md)
- [XAdES](xades.md)
- [Person token](person-token.md)
- [Verification link](verification-link.md)
- [QR](qr.md)
