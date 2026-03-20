# Workflow: tryb offline

`OfflineInvoiceWorkflow` udostępnia gotowy scenariusz wysyłki faktur w trybach offline.
Workflow bazuje na sesji interaktywnej (`open -> send -> close`) i wymusza `offlineMode=true` przy wysyłce.

Dostęp: `client.workflows.offline`.

## Metody

- `sendOfflineInvoice(options)`
- `sendOfflineTechnicalCorrection(options)`
- `getProcedureInstructions(mode)`
- `listProcedureInstructions()`

## Tryby i instrukcje

`getProcedureInstructions(mode)` zwraca instrukcje operacyjne dla:

- `offline24`
- `offline`
- `awaryjny`

Każda instrukcja zawiera:

- `mode`
- `responsibility`
- `sendDeadline`
- `legalBasis`
- `operationalSteps`

## Opcje `sendOfflineInvoice(options)`

- pola z `OnlineSessionOpenOptions`: `formCode`, `publicCertificateBase64Der`, `upoV43`
- `invoice` (wymagane)
- `waitForUpo` (opcjonalnie; domyślnie `true`)
- `waitForUpoOptions` (opcjonalnie; `pollIntervalMs`, `maxAttempts`)

Obsługiwane `formCode` są takie same jak w sesji online (`FA (2)`, `FA (3)`, `PEF (3)`, `PEF_KOR (3)`, `FA_RR (1)`).
Dla `FA_RR (1)` w wersji `1-1E` używaj `formCode.value = "FA_RR"`.
Dla RR przekazuj gotowy XML (`string`/`Buffer`).

## Opcje `sendOfflineTechnicalCorrection(options)`

- wszystko z `sendOfflineInvoice(options)`
- `hashOfCorrectedInvoice` (wymagane, niepuste)

## Przykład 1: standardowa wysyłka offline

```ts
const result = await client.workflows.offline.sendOfflineInvoice({
  formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
  invoice: "<Faktura>...</Faktura>",
  waitForUpo: true,
  waitForUpoOptions: {
    pollIntervalMs: 2000,
    maxAttempts: 60,
  },
});

console.log(result.sessionReferenceNumber);
console.log(result.invoiceReferenceNumber);
console.log(Boolean(result.upoXml), Boolean(result.upo));
```

## Przykład 2: wysyłka offline bez czekania na UPO

```ts
const result = await client.workflows.offline.sendOfflineInvoice({
  formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
  invoice: "<Faktura>...</Faktura>",
  waitForUpo: false,
});

console.log(result.invoiceReferenceNumber, result.upoXml); // upoXml === null
```

## Przykład 3: korekta techniczna faktury offline

```ts
const result = await client.workflows.offline.sendOfflineTechnicalCorrection({
  formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
  invoice: "<FakturaKorygujaca>...</FakturaKorygujaca>",
  hashOfCorrectedInvoice: "BASE64_SHA256_ODRZUCONEJ_FAKTURY",
  waitForUpo: true,
});

console.log(result.invoiceReferenceNumber);
```

## Przykład 4: instrukcje dla operatora

```ts
const guide = client.workflows.offline.getProcedureInstructions("offline24");
console.log(guide.mode, guide.sendDeadline, guide.legalBasis);
console.log(guide.operationalSteps);
```

## Przykład 5: pobranie wszystkich instrukcji

```ts
const guides = client.workflows.offline.listProcedureInstructions();
for (const guide of guides) {
  console.log(guide.mode, guide.responsibility, guide.sendDeadline);
}
```

## Checklista operacyjna

1. Ustal aktywny tryb (`offline24`, `offline`, `awaryjny`) i pobierz instrukcje przez `getProcedureInstructions(mode)`.
2. Wystaw fakturę FA(3) i wyślij ją przez `sendOfflineInvoice(...)`.
3. Zachowaj referencje sesji/faktury oraz UPO (lub zapisz zadanie na późniejszy polling UPO).
4. Monitoruj komunikaty KSeF/BIP, bo mogą zmienić termin dosłania dokumentów.
5. Jeśli dokument zostanie odrzucony technicznie, wyślij korektę przez `sendOfflineTechnicalCorrection(...)` z `hashOfCorrectedInvoice`.

## Uwagi

- Ten workflow nie zmienia merytorycznej treści faktury; odpowiada za sposób wysyłki i obsługę procesu.
- `sendOfflineTechnicalCorrection(...)` służy do korekty technicznej, nie biznesowej.
- Informacje o terminach i podstawach prawnych w instrukcjach traktuj jako wsparcie operacyjne; ostateczna interpretacja powinna opierać się o aktualne komunikaty MF/KSeF i przepisy.
