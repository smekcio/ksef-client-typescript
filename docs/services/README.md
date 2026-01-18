# Services

Services to publiczne klasy i funkcje pomocnicze. Sa eksportowane z paczki i uzywane w workflow.

## Lista

- `AuthCoordinator` (auth token / XAdES)
- `XadesSignatureService` (XAdES enveloped)
- `OnlineSessionWorkflow`
- `BatchSessionWorkflow`
- `InvoiceExportWorkflow`
- `IncrementalExportWorkflow` (przyrostowe pobieranie paczek)
- `VerificationLinkService` (QR linki i podpisy)
- `PersonTokenService` (parsowanie JWT)
- `QrCodeService` (PNG/SVG/Data URL)
- `CryptographyService`
- `authXml` (budowa XML do podpisu)
- `hwmCoordinator` (HWM / kontynuacja exportu)

Zobacz tez: [Workflows](../workflows/README.md).

## Strony

- [Auth](auth.md)
- [Crypto](crypto.md)
- [HWM](hwm.md)
- [XAdES](xades.md)
- [Person token](person-token.md)
- [Verification link](verification-link.md)
- [QR](qr.md)
