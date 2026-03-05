import assert from "node:assert/strict";
import { test } from "node:test";
import { QrCodeService } from "../../dist/index.js";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

test("QrCodeService renders PNG/SVG/DataURL when qrcode dependency is present", async () => {
  const service = new QrCodeService();
  try {
    await import("qrcode");
  } catch {
    await assert.rejects(
      () => service.toDataUrl("https://ksef.mf.gov.pl"),
      /Optional dependency "qrcode"/,
    );
    return;
  }

  const png = await service.toPngBuffer("https://ksef.mf.gov.pl", {
    width: 180,
    margin: 1,
  });
  assert.ok(Buffer.isBuffer(png));
  assert.equal(png.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC), true);

  const svg = await service.toSvgString("https://ksef.mf.gov.pl", { margin: 0 });
  assert.match(svg, /^<svg[\s>]/);

  const dataUrl = await service.toDataUrl("https://ksef.mf.gov.pl", { width: 120 });
  assert.match(dataUrl, /^data:image\/png;base64,/);
});

test("QrCodeService converts non-Buffer toBuffer output into Buffer", async () => {
  try {
    await import("qrcode");
  } catch {
    return;
  }

  const originalIsBuffer = Buffer.isBuffer;
  Buffer.isBuffer = () => false;
  try {
    const service = new QrCodeService();
    const png = await service.toPngBuffer("https://ksef.mf.gov.pl");
    assert.equal(originalIsBuffer(png), true);
    assert.equal(png.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC), true);
    assert.equal(png.equals(PNG_MAGIC), false);
  } finally {
    Buffer.isBuffer = originalIsBuffer;
  }
});
