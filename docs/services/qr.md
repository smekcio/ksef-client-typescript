# QrCodeService

Generuje obraz QR (PNG/SVG) lub Data URL dla dowolnego tekstu/URL.

Usluga wymaga opcjonalnej zaleznosci runtime: `qrcode`.

```bash
npm i qrcode
```

## PNG

```ts
import { QrCodeService } from "ksef-client-typescript";

const qr = new QrCodeService();
const png = await qr.toPngBuffer("https://example.com");
```

## SVG

```ts
const svg = await qr.toSvgString("https://example.com");
```

## Data URL

```ts
const dataUrl = await qr.toDataUrl("https://example.com");
```
