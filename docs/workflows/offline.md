# Workflow: tryb offline

`OfflineInvoiceWorkflow` realizuje gotowy flow do wysylki faktur gdy system dziala w trybie offline:

- `sendOfflineInvoice(...)` - standardowa wysylka offline z `offlineMode=true`,
- `sendOfflineTechnicalCorrection(...)` - korekta techniczna z `hashOfCorrectedInvoice`,
- `getProcedureInstructions(mode)` - instrukcja operacyjna dla `offline24`, `offline`, `awaryjny`.

Workflow jest dostepny pod `client.workflows.offline`.

## Przyklad 1: wysylka faktury offline

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
console.log(Boolean(result.upoXml));
```

## Przyklad 2: korekta techniczna faktury offline

```ts
const result = await client.workflows.offline.sendOfflineTechnicalCorrection({
  formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
  invoice: "<Faktura>...</Faktura>",
  hashOfCorrectedInvoice: "BASE64_SHA256_ODRZUCONEJ_FAKTURY",
  waitForUpo: true,
});

console.log(result.invoiceReferenceNumber);
```

## Przyklad 3: instrukcje postepowania dla operatora

```ts
const guide = client.workflows.offline.getProcedureInstructions("offline24");
console.log(guide.sendDeadline);
console.log(guide.operationalSteps);
```

## Instrukcje postepowania (checklista)

1. Zidentyfikuj tryb pracy (`offline24`, `offline`, `awaryjny`) i pobierz instrukcje:
   - `client.workflows.offline.getProcedureInstructions(mode)`
2. Wystaw fakture zgodna z FA(3) i wyslij ja z `offlineMode=true`:
   - `client.workflows.offline.sendOfflineInvoice(...)`
3. Po wystawieniu dokumentu wygeneruj i przekaz nabywcy kody QR:
   - QR-I (weryfikacja faktury) i QR-II (potwierdzenie wystawcy).
4. Monitoruj komunikaty KSeF/BIP:
   - awaria moze zmienic termin doslania faktur (przesuniecie/reset licznika).
5. Zachowaj artefakty audytowe:
   - referencje sesji i faktury, UPO, hash faktury, tryb offline.
6. Jesli faktura offline zostanie odrzucona technicznie:
   - wyslij `sendOfflineTechnicalCorrection(...)` z `hashOfCorrectedInvoice`.

## Uwagi

- Workflow `offline` wykorzystuje sesje interaktywna pod spodem (`open -> send -> close`).
- Korekta techniczna nie sluzy do merytorycznej zmiany tresci faktury, tylko do poprawy bledow technicznych.
- Sredowisko i terminy nalezy walidowac zgodnie z aktualnymi komunikatami MF/KSeF.
