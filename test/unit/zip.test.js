import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { test } from "node:test";
import { ZipFile } from "yazl";
import { createZip, unzip } from "../../dist/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const zipModuleUrl = pathToFileURL(path.resolve(__dirname, "../../src/utils/zip.ts")).href;

async function runNodeWithLoader({ loaderSource, script }) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ksef-zip-loader-"));
  const loaderPath = path.join(tempDir, "loader.mjs");
  const loaderUrl = pathToFileURL(loaderPath).href;
  await writeFile(loaderPath, loaderSource, "utf8");

  try {
    return spawnSync(
      process.execPath,
      ["--experimental-loader", loaderUrl, "--input-type=module", "--eval", script],
      {
        cwd: process.cwd(),
        env: process.env,
        encoding: "utf8",
      },
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function setUInt32LE(buffer, offset, value) {
  buffer.writeUInt32LE(value >>> 0, offset);
}

function patchZipCompressedSizesToZero(zipBuffer) {
  const patched = Buffer.from(zipBuffer);
  for (let i = 0; i <= patched.length - 4; i += 1) {
    const signature = patched.readUInt32LE(i);
    if (signature === 0x04034b50) {
      setUInt32LE(patched, i + 18, 0);
      continue;
    }
    if (signature === 0x02014b50) {
      setUInt32LE(patched, i + 20, 0);
    }
  }
  return patched;
}

function patchZipCompressionMethod(zipBuffer, method) {
  const patched = Buffer.from(zipBuffer);
  for (let i = 0; i <= patched.length - 4; i += 1) {
    const signature = patched.readUInt32LE(i);
    if (signature === 0x04034b50) {
      patched.writeUInt16LE(method, i + 8);
      continue;
    }
    if (signature === 0x02014b50) {
      patched.writeUInt16LE(method, i + 10);
    }
  }
  return patched;
}

test("createZip and unzip perform roundtrip for multiple files", async () => {
  const zipBuffer = await createZip([
    { fileName: "a.txt", content: Buffer.from("alpha", "utf8") },
    { fileName: "nested/b.txt", content: Buffer.from("beta", "utf8") },
  ]);

  const files = await unzip(zipBuffer);

  assert.equal(files.size, 2);
  assert.equal(files.get("a.txt")?.toString("utf8"), "alpha");
  assert.equal(files.get("nested/b.txt")?.toString("utf8"), "beta");
});

test("unzip rejects when archive contains more files than allowed by maxFiles", async () => {
  const zipBuffer = await createZip([
    { fileName: "one.txt", content: Buffer.from("1", "utf8") },
    { fileName: "two.txt", content: Buffer.from("2", "utf8") },
  ]);

  await assert.rejects(() => unzip(zipBuffer, { maxFiles: 1 }), /zip contains too many files/);
});

test("unzip rejects malformed archive buffers", async () => {
  await assert.rejects(
    () => unzip(Buffer.from("not-a-zip", "utf8")),
    /signature not found|Failed to open zip buffer/,
  );
});

test("unzip ignores directory entries and keeps file payloads", async () => {
  const zipBuffer = await new Promise((resolve, reject) => {
    const zip = new ZipFile();
    zip.addEmptyDirectory("nested/");
    zip.addBuffer(Buffer.from("x", "utf8"), "nested/file.txt");
    const chunks = [];
    zip.outputStream.on("data", (chunk) => chunks.push(chunk));
    zip.outputStream.on("end", () => resolve(Buffer.concat(chunks)));
    zip.outputStream.on("error", reject);
    zip.end();
  });

  const files = await unzip(zipBuffer);
  assert.equal(files.size, 1);
  assert.equal(files.get("nested/file.txt")?.toString("utf8"), "x");
});

test("unzip enforces max entry and total size limits", async () => {
  const zipBuffer = await createZip([
    { fileName: "a.txt", content: Buffer.alloc(8, 65) },
    { fileName: "b.txt", content: Buffer.alloc(8, 66) },
  ]);

  await assert.rejects(
    () => unzip(zipBuffer, { maxFileUncompressedSize: 4 }),
    /max_file_uncompressed_size/,
  );
  await assert.rejects(
    () => unzip(zipBuffer, { maxTotalUncompressedSize: 10 }),
    /max_total_uncompressed_size/,
  );
});

test("unzip enforces max compression ratio", async () => {
  const highlyCompressible = Buffer.alloc(20_000, 65);
  const zipBuffer = await createZip([{ fileName: "bomb.txt", content: highlyCompressible }]);
  await assert.rejects(
    () => unzip(zipBuffer, { maxCompressionRatio: 1 }),
    /max_compression_ratio/,
  );
});

test("unzip rejects entries with zero compressed size and non-zero uncompressed size metadata", async () => {
  const zipBuffer = await createZip([{ fileName: "metadata.txt", content: Buffer.from("abc", "utf8") }]);
  const tampered = patchZipCompressedSizesToZero(zipBuffer);
  await assert.rejects(
    () => unzip(tampered),
    /suspicious compression metadata/,
  );
});

test("unzip rejects entries when stream cannot be opened for unsupported compression method", async () => {
  const zipBuffer = await createZip([{ fileName: "unsupported.txt", content: Buffer.from("abc", "utf8") }]);
  const tampered = patchZipCompressionMethod(zipBuffer, 99);
  await assert.rejects(
    () => unzip(tampered),
    /unsupported compression method|Failed to read zip entry/,
  );
});

test("unzip handles callback with missing zipfile object", async () => {
  const run = await runNodeWithLoader({
    loaderSource: `
      export async function resolve(specifier, context, defaultResolve) {
        if (specifier === "yauzl") {
          return { url: "zip-yauzl-mock:module", shortCircuit: true };
        }
        return defaultResolve(specifier, context, defaultResolve);
      }

      export async function load(url, context, defaultLoad) {
        if (url === "zip-yauzl-mock:module") {
          return {
            format: "module",
            shortCircuit: true,
            source: \`
              export class Entry {}
              export function fromBuffer(_buffer, _options, callback) {
                callback(null, undefined);
              }
            \`,
          };
        }
        return defaultLoad(url, context, defaultLoad);
      }
    `,
    script: `
      import assert from "node:assert/strict";
      import { unzip } from ${JSON.stringify(zipModuleUrl)};
      await assert.rejects(() => unzip(Buffer.from("PK", "utf8")), /Failed to open zip buffer/);
    `,
  });
  assert.equal(run.status, 0, `stdout:\\n${run.stdout}\\nstderr:\\n${run.stderr}`);
});

test("unzip handles entries with undefined size metadata by applying zero defaults", async () => {
  const run = await runNodeWithLoader({
    loaderSource: `
      export async function resolve(specifier, context, defaultResolve) {
        if (specifier === "yauzl") {
          return { url: "zip-yauzl-mock:module", shortCircuit: true };
        }
        return defaultResolve(specifier, context, defaultResolve);
      }

      export async function load(url, context, defaultLoad) {
        if (url === "zip-yauzl-mock:module") {
          return {
            format: "module",
            shortCircuit: true,
            source: \`
              import { EventEmitter } from "node:events";
              import { PassThrough } from "node:stream";
              export class Entry {}
              export function fromBuffer(_buffer, _options, callback) {
                class FakeZipFile extends EventEmitter {
                  constructor() {
                    super();
                    this.emitted = false;
                  }

                  readEntry() {
                    if (!this.emitted) {
                      this.emitted = true;
                      setImmediate(() =>
                        this.emit("entry", {
                          fileName: "x.txt",
                          uncompressedSize: undefined,
                          compressedSize: undefined,
                        }),
                      );
                      return;
                    }
                    setImmediate(() => this.emit("end"));
                  }

                  openReadStream(_entry, streamCallback) {
                    const stream = new PassThrough();
                    setImmediate(() => stream.end(Buffer.from("x", "utf8")));
                    streamCallback(null, stream);
                  }
                }
                callback(null, new FakeZipFile());
              }
            \`,
          };
        }
        return defaultLoad(url, context, defaultLoad);
      }
    `,
    script: `
      import assert from "node:assert/strict";
      import { unzip } from ${JSON.stringify(zipModuleUrl)};
      const files = await unzip(Buffer.from("PK", "utf8"));
      assert.equal(files.size, 1);
      assert.equal(files.get("x.txt")?.toString("utf8"), "x");
    `,
  });
  assert.equal(run.status, 0, `stdout:\\n${run.stdout}\\nstderr:\\n${run.stderr}`);
});

test("unzip handles missing read stream object from openReadStream callback", async () => {
  const run = await runNodeWithLoader({
    loaderSource: `
      export async function resolve(specifier, context, defaultResolve) {
        if (specifier === "yauzl") {
          return { url: "zip-yauzl-mock:module", shortCircuit: true };
        }
        return defaultResolve(specifier, context, defaultResolve);
      }

      export async function load(url, context, defaultLoad) {
        if (url === "zip-yauzl-mock:module") {
          return {
            format: "module",
            shortCircuit: true,
            source: \`
              import { EventEmitter } from "node:events";
              export class Entry {}
              export function fromBuffer(_buffer, _options, callback) {
                class FakeZipFile extends EventEmitter {
                  constructor() {
                    super();
                    this.emitted = false;
                  }

                  readEntry() {
                    if (!this.emitted) {
                      this.emitted = true;
                      setImmediate(() =>
                        this.emit("entry", { fileName: "x.txt", uncompressedSize: 1, compressedSize: 1 }),
                      );
                      return;
                    }
                    setImmediate(() => this.emit("end"));
                  }

                  openReadStream(_entry, streamCallback) {
                    streamCallback(null, undefined);
                  }
                }
                callback(null, new FakeZipFile());
              }
            \`,
          };
        }
        return defaultLoad(url, context, defaultLoad);
      }
    `,
    script: `
      import assert from "node:assert/strict";
      import { unzip } from ${JSON.stringify(zipModuleUrl)};
      await assert.rejects(() => unzip(Buffer.from("PK", "utf8")), /Failed to read zip entry/);
    `,
  });
  assert.equal(run.status, 0, `stdout:\\n${run.stdout}\\nstderr:\\n${run.stderr}`);
});
