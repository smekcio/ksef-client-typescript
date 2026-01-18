# Faktura FA (XML builder)

## API

- `buildFakturaXml(faktura, options?)`
- `serializeInvoiceXml(input, options?)`

`serializeInvoiceXml` przyjmuje string, Buffer, dokument XML albo obiekt faktury.

## Przyklad (obiekt -> XML)

```ts
import { buildFakturaXml } from "ksef-client-typescript";

const xml = buildFakturaXml({
  Naglowek: {
    KodFormularza: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
    WariantFormularza: "3",
    DataWytworzeniaFa: "2026-01-07T00:00:00Z",
    SystemInfo: "Demo",
  },
  Podmiot1: {
    DaneIdentyfikacyjne: { NIP: "1111111111", Nazwa: "Sprzedawca" },
    Adres: { KodKraju: "PL", AdresL1: "ul. Test 1", AdresL2: "00-001 Warszawa" },
  },
  Podmiot2: {
    DaneIdentyfikacyjne: { NIP: "2222222222", Nazwa: "Nabywca" },
    Adres: { KodKraju: "PL", AdresL1: "ul. Test 2", AdresL2: "00-002 Warszawa" },
  },
  Fa: {
    KodWaluty: "PLN",
    P_1: "2026-01-07",
    P_2: "FV/1/2026",
    P_13_1: "100.00",
    P_14_1: "23.00",
    P_15: "123.00",
    Adnotacje: {
      P_16: "2",
      P_17: "2",
      P_18: "2",
      P_18A: "2",
      Zwolnienie: { P_19N: "1" },
      NoweSrodkiTransportu: { P_22N: "1" },
      P_23: "2",
      PMarzy: { P_PMarzyN: "1" },
    },
    RodzajFaktury: "VAT",
    FaWiersz: {
      NrWierszaFa: "1",
      P_7: "Usluga",
      P_8A: "szt.",
      P_8B: "1",
      P_9A: "100.00",
      P_11: "100.00",
      P_12: "23",
    },
  },
});
```

## Przyklad (serializeInvoiceXml)

```ts
import { serializeInvoiceXml } from "ksef-client-typescript";

const buffer = serializeInvoiceXml("<Faktura>...</Faktura>");
```
