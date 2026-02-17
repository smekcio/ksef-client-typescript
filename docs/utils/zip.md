# ZIP

Funkcje tworzą archiwum ZIP z pamięci oraz bezpiecznie je rozpakowują z limitami ochronnymi.

## API

- `createZip(entries: ZipEntryInput[]): Promise<Buffer>`
- `unzip(buffer: Buffer, options?: UnzipOptions): Promise<Map<string, Buffer>>`

```ts
interface ZipEntryInput {
  fileName: string;
  content: Buffer | Uint8Array;
}

interface UnzipOptions {
  maxFiles?: number;
  maxTotalUncompressedSize?: number;
  maxFileUncompressedSize?: number;
  maxCompressionRatio?: number | null;
}
```

## Domyślne limity `unzip`

- `maxFiles`: `10_000`
- `maxTotalUncompressedSize`: `2_000_000_000` bajtów
- `maxFileUncompressedSize`: `500_000_000` bajtów
- `maxCompressionRatio`: `200`

`maxCompressionRatio: null` wyłącza kontrolę współczynnika kompresji.

## Przykład

```ts
import { createZip, unzip } from "ksef-client-typescript";

const zip = await createZip([
  { fileName: "a.txt", content: Buffer.from("test", "utf8") },
  { fileName: "b.txt", content: Buffer.from("123", "utf8") },
]);

const files = await unzip(zip, {
  maxFiles: 100,
  maxCompressionRatio: 100,
});

console.log(files.get("a.txt")?.toString("utf8")); // "test"
```

## Uwagi operacyjne

- `unzip(...)` pomija wpisy katalogowe (`name/`).
- Po przekroczeniu limitów funkcja odrzuca `Promise` z błędem (np. `zip contains too many files`, `zip exceeds max_total_uncompressed_size`).
- Wynikiem jest `Map<string, Buffer>`, gdzie kluczem jest pełna nazwa wpisu ZIP.
