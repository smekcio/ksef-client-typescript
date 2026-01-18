export interface QrCodeRenderOptions {
  errorCorrectionLevel?: "L" | "M" | "Q" | "H";
  margin?: number;
  width?: number;
}

type QrCodeModule = typeof import("qrcode");

async function loadQrCode(): Promise<QrCodeModule> {
  try {
    return (await import("qrcode")) as QrCodeModule;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown import error";
    throw new Error(
      `Optional dependency "qrcode" is required for QrCodeService. Install it with: npm i qrcode. (${message})`,
    );
  }
}

export class QrCodeService {
  async toPngBuffer(value: string, options: QrCodeRenderOptions = {}): Promise<Buffer> {
    const qrcode = await loadQrCode();
    const buffer = await qrcode.toBuffer(value, {
      type: "png",
      errorCorrectionLevel: options.errorCorrectionLevel,
      margin: options.margin,
      width: options.width,
    });
    return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  }

  async toSvgString(value: string, options: QrCodeRenderOptions = {}): Promise<string> {
    const qrcode = await loadQrCode();
    return await qrcode.toString(value, {
      type: "svg",
      errorCorrectionLevel: options.errorCorrectionLevel,
      margin: options.margin,
      width: options.width,
    });
  }

  async toDataUrl(value: string, options: QrCodeRenderOptions = {}): Promise<string> {
    const qrcode = await loadQrCode();
    return await qrcode.toDataURL(value, {
      errorCorrectionLevel: options.errorCorrectionLevel,
      margin: options.margin,
      width: options.width,
    });
  }
}
