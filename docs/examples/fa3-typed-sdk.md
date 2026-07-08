# FA(3) typed SDK examples

Typed SDK FA(3) działa samodzielnie w repo TypeScript. Schematy XSD są pakowane do `dist`, a runtime
walidacji `toXml({ xsdValidate: true })` wymaga opcjonalnej zależności `libxmljs2`.

## Single invoice

```ts
import { FA3Invoice } from "ksef-client";

const draft = FA3Invoice.basic("FV/1")
  .issueDate("2026-05-18T10:00:00Z")
  .seller({ name: "Sprzedawca", taxId: "1111111111" })
  .buyer({ name: "Nabywca", taxId: "2222222222" })
  .addLine({
    description: "Usługa",
    quantity: 1,
    unit: "szt",
    unitNetPrice: 100,
    vatRate: 23,
  })
  .build();

const xml = await draft.toXml({ xsdValidate: true });
```

## Correction before/after

```ts
import { FA3Invoice } from "ksef-client";

const correction = FA3Invoice.correction("KOR/1")
  .issueDate("2026-05-18T10:00:00Z")
  .seller({ name: "Sprzedawca", taxId: "1111111111" })
  .buyer({ name: "Nabywca", taxId: "2222222222" })
  .correction({
    reason: "Korekta ceny",
    correctedInvoiceNumber: "FV/OLD/1",
    correctedInvoiceDate: "2026-05-01",
  })
  .addCorrectedLineBeforeAfter({
    before: { description: "Usługa", quantity: 1, unit: "szt", unitNetPrice: 200, vatRate: 23 },
    after: { description: "Usługa", quantity: 1, unit: "szt", unitNetPrice: 100, vatRate: 23 },
  })
  .build();

const correctionXml = await correction.toXml();
```

## Settlement invoice

```ts
import { FA3Invoice } from "ksef-client";

const settlement = FA3Invoice.settlement("ROZ/1")
  .issueDate("2026-05-18T10:00:00Z")
  .seller({ name: "Sprzedawca", taxId: "1111111111" })
  .buyer({ name: "Nabywca", taxId: "2222222222" })
  .advanceReference({ invoiceNumber: "FV/ZAL/1" })
  .addServiceLine("Usługa", { quantity: 1, unitNetPrice: 100, vatRate: 23 })
  .settlementDetails({
    amountDue: "125.00",
    charges: [{ amount: "3.00", reason: "Dopłata" }],
    deductions: [{ amount: "1.00", reason: "Rabat" }],
  })
  .build();

const settlementXml = await settlement.toXml();
```

## JSON roundtrip

```ts
import { FA3BatchDraft } from "ksef-client";

const batch = new FA3BatchDraft([draft]);
const json = batch.toJson();
const restored = FA3BatchDraft.fromJson(json);

await restored.drafts[0].toXml();
```

## Batch ZIP flow

```ts
import { FA3BatchDraft } from "ksef-client";

const batch = new FA3BatchDraft([draftA, draftB]);

await batch.toXmlFiles("./out/fa3");
await batch.toXmlZip("./out/fa3.zip");
```

