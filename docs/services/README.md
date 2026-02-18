# Usługi (`ksef-client-typescript`)

Warstwa usług łączy wywołania API KSeF z operacjami lokalnymi (kryptografia, ZIP, XAdES, HWM, QR). Dzięki temu możesz korzystać z gotowych scenariuszy albo budować własne przepływy krok po kroku.

W większości integracji punktem wejścia są workflowy:
- `AuthCoordinator`
- `OnlineSessionWorkflow`
- `BatchSessionWorkflow`
- `InvoiceExportWorkflow`
- `IncrementalExportWorkflow`
- `OfflineInvoiceWorkflow`

Gdy potrzebujesz większej kontroli nad payloadami, używaj usług niższego poziomu: `buildAuthTokenRequestXml`, `CryptographyService`, `XadesSignatureService`, `VerificationLinkService`, `QrCodeService`, `PersonTokenService`.

Spis stron:
- [Workflows i scenariusze](workflows.md)
- [Auth (XML i proces uwierzytelnienia)](auth.md)
- [Kryptografia i metadane](crypto.md)
- [UPO i polling](upo.md)
- [Batch (podział, szyfrowanie, upload)](batch.md)
- [XAdES](xades.md)
- [CSR](csr.md)
- [Linki weryfikacyjne](verification-link.md)
- [QR](qr.md)
- [HWM i deduplikacja](hwm.md)
- [Person token (inspekcja JWT)](person-token.md)
