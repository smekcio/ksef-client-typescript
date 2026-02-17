# Narzędzia buforów (`buffer`)

Narzędzia do pracy z danymi binarnymi.

## API

- `splitBuffer(buffer: Buffer, maxPartSize: number): Buffer[]`

## Co robi `splitBuffer`

- Dzieli `buffer` na części o maksymalnym rozmiarze `maxPartSize` (w bajtach).
- Jeśli bufor mieści się w limicie, zwraca tablicę z jednym elementem.
- Gdy `maxPartSize <= 0`, rzuca `Error("maxPartSize must be positive.")`.

## Przykład

```ts
import { splitBuffer } from "ksef-client-typescript";

const parts = splitBuffer(Buffer.from("123456", "utf8"), 2);
console.log(parts.map((p) => p.toString("utf8"))); // ["12", "34", "56"]
```

## Uwagi operacyjne

- Zwracane części to widoki (`Buffer.subarray(...)`) na ten sam obszar pamięci.
- Modyfikacja bajtów w części wpływa na oryginalny bufor.
