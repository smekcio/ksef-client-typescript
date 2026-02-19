# XML (`ksef-client-typescript`)

Moduł `xml` udostępnia:

- narzędzia ogólne do parsowania i budowania XML (`parseXml`, `buildXml`, `buildXmlFromObject`),
- builder dokumentów fakturowych FA (`buildFakturaXml`),
- serializację wejść fakturowych i PEF do `Buffer` (`serializeInvoiceXml`),
- builder UBL dla PEF/PEF_KOR (`buildPefXml`),
- parser UPO (`parseUpoXml`).

Uwaga: SDK nie zawiera dedykowanego buildera RR; dla RR przekazuj gotowy XML (`string`/`Buffer`) do `serializeInvoiceXml`/workflowów.

## Strony

- [Serializacja i parser XML](serialization.md)
- [Faktury FA/PEF i `serializeInvoiceXml`](invoice.md)

## Przykład importu

```ts
import {
  buildFakturaXml,
  buildPefXml,
  parseUpoXml,
  parseXml,
  serializeInvoiceXml,
} from "ksef-client-typescript";
```
