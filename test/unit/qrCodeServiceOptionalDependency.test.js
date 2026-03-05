import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { test } from "node:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distIndexUrl = pathToFileURL(path.resolve(__dirname, "../../dist/index.js")).href;

test("QrCodeService reports missing optional dependency when qrcode import fails", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ksef-qr-loader-"));
  const loaderPath = path.join(tempDir, "block-qrcode-loader.mjs");
  const loaderUrl = pathToFileURL(loaderPath).href;
  await writeFile(
    loaderPath,
    `
      export async function resolve(specifier, context, defaultResolve) {
        if (specifier === "qrcode") {
          throw new Error("blocked-qrcode-for-test");
        }
        return defaultResolve(specifier, context, defaultResolve);
      }
    `,
    "utf8",
  );

  const script = `
    import assert from "node:assert/strict";
    import { QrCodeService } from ${JSON.stringify(distIndexUrl)};

    const service = new QrCodeService();
    try {
      await service.toDataUrl("https://ksef.mf.gov.pl");
      throw new Error("expected toDataUrl to fail");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      assert.match(message, /Optional dependency "qrcode"/);
      assert.match(message, /blocked-qrcode-for-test/);
    }
  `;

  try {
    const run = spawnSync(
      process.execPath,
      ["--experimental-loader", loaderUrl, "--input-type=module", "--eval", script],
      {
        cwd: process.cwd(),
        env: { ...process.env },
        encoding: "utf8",
      },
    );
    assert.equal(run.status, 0, `stdout:\n${run.stdout}\nstderr:\n${run.stderr}`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("QrCodeService import failure fallback handles non-Error thrown values", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ksef-qr-loader-"));
  const loaderPath = path.join(tempDir, "block-qrcode-loader-non-error.mjs");
  const loaderUrl = pathToFileURL(loaderPath).href;
  await writeFile(
    loaderPath,
    `
      export async function resolve(specifier, context, defaultResolve) {
        if (specifier === "qrcode") {
          throw "blocked-qrcode-non-error";
        }
        return defaultResolve(specifier, context, defaultResolve);
      }
    `,
    "utf8",
  );

  const script = `
    import assert from "node:assert/strict";
    import { QrCodeService } from ${JSON.stringify(distIndexUrl)};

    const service = new QrCodeService();
    try {
      await service.toDataUrl("https://ksef.mf.gov.pl");
      throw new Error("expected toDataUrl to fail");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      assert.match(message, /Unknown import error/);
    }
  `;

  try {
    const run = spawnSync(
      process.execPath,
      ["--experimental-loader", loaderUrl, "--input-type=module", "--eval", script],
      {
        cwd: process.cwd(),
        env: { ...process.env },
        encoding: "utf8",
      },
    );
    assert.equal(run.status, 0, `stdout:\n${run.stdout}\nstderr:\n${run.stderr}`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
