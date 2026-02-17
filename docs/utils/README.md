# Narzędzia (`utils`)

Moduł `utils` udostępnia lekkie funkcje pomocnicze używane przez workflowy i integracje własne.
Wszystkie poniższe funkcje są eksportowane z głównego wejścia pakietu (`ksef-client-typescript`).

## Spis narzędzi

- [Base64Url](base64url.md) - konwersja `Buffer <-> Base64Url`
- [Buffer](buffer.md) - dzielenie bufora na części (`splitBuffer`)
- [CRC-8](crc8.md) - obliczanie sumy kontrolnej (`crc8`, `crc8Hex`)
- [JWT](jwt.md) - dekodowanie payloadu tokena i odczyt daty wygaśnięcia
- [Numer KSeF](ksef-number.md) - lokalna walidacja numeru wraz z checksumą
- [ZIP](zip.md) - tworzenie i rozpakowanie archiwów z limitami bezpieczeństwa

## Przykład importu

```ts
import { crc8Hex, splitBuffer, unzip } from "ksef-client-typescript";
```

## Powiązane

- [XML](../xml/README.md)
- [Usługi](../services/README.md)
