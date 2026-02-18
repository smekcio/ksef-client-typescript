# QR (`QrCodeService`)

`QrCodeService` generuje kod QR dla dowolnego tekstu/URL.

Wymagana jest opcjonalna zależność runtime:

```bash
npm i qrcode
```

## Metody

- `toPngBuffer(value, options?) -> Promise<Buffer>`
- `toSvgString(value, options?) -> Promise<string>`
- `toDataUrl(value, options?) -> Promise<string>`

`options` (`QrCodeRenderOptions`):

- `errorCorrectionLevel`: `"L" | "M" | "Q" | "H"`
- `margin`
- `width`

Przykład:

```ts
import { QrCodeService } from "ksef-client-typescript";

const qr = new QrCodeService();

const png = await qr.toPngBuffer("https://example.com", { width: 320 });
const svg = await qr.toSvgString("https://example.com");
const dataUrl = await qr.toDataUrl("https://example.com");

console.log(png.length, svg.length, dataUrl.slice(0, 32));
```

Powiązane: [Linki weryfikacyjne](verification-link.md).
