# Invoices

Thin client dla `/invoices/*`.

## Metody

- `getInvoice(ksefNumber)`
- `queryInvoiceMetadata(filters, pageOffset?, pageSize?, sortOrder?)`
- `exportInvoices(request)`
- `getInvoiceExportStatus(referenceNumber)`

## Przyklad

```ts
const xml = await client.invoices.getInvoice("KSEF_NUMER");

const result = await client.invoices.queryInvoiceMetadata({
  subjectType: "Subject1",
  dateRange: { dateType: "Issue", from: "2025-01-01", to: "2025-01-31" },
});
```
