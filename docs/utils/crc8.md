# CRC-8

Funkcje obliczają sumę kontrolną CRC-8 dla tekstu wejściowego (UTF-8), z wielomianem `0x07`.

## API

- `crc8(input: string): number`
- `crc8Hex(input: string): string`

## Przykład

```ts
import { crc8, crc8Hex } from "ksef-client-typescript";

const value = "0123456789ABCDEF";

console.log(crc8(value)); // liczba z zakresu 0-255
console.log(crc8Hex(value)); // dwuznakowy HEX (00-FF)
```

## Uwagi operacyjne

- `crc8Hex(...)` zwraca wynik w wielkich literach, zawsze z dwoma znakami (`00`-`FF`).
- Obliczenie odbywa się na bajtach UTF-8 przekazanego stringa.
