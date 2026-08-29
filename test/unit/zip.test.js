import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { test } from "node:test";
import { ZipFile } from "yazl";
import { createZip, unzip, untarGz } from "../../dist/index.js";
import { gzipSync } from "node:zlib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distModuleUrl = pathToFileURL(path.resolve(__dirname, "../../dist/index.js")).href;

async function runNodeWithLoader({ loaderSource, script }) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ksef-zip-loader-"));
  const loaderPath = path.join(tempDir, "loader.mjs");
  const loaderUrl = pathToFileURL(loaderPath).href;
  const childEnv = { ...process.env };
  delete childEnv.NODE_V8_COVERAGE;
  await writeFile(loaderPath, loaderSource, "utf8");

  try {
    return spawnSync(
      process.execPath,
      ["--experimental-loader", loaderUrl, "--input-type=module", "--eval", script],
      {
        cwd: process.cwd(),
        env: childEnv,
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
  await assert.rejects(() => unzip(zipBuffer, { maxCompressionRatio: 1 }), /max_compression_ratio/);
});

test("unzip rejects entries with zero compressed size and non-zero uncompressed size metadata", async () => {
  const zipBuffer = await createZip([
    { fileName: "metadata.txt", content: Buffer.from("abc", "utf8") },
  ]);
  const tampered = patchZipCompressedSizesToZero(zipBuffer);
  await assert.rejects(() => unzip(tampered), /suspicious compression metadata/);
});

test("unzip rejects entries when stream cannot be opened for unsupported compression method", async () => {
  const zipBuffer = await createZip([
    { fileName: "unsupported.txt", content: Buffer.from("abc", "utf8") },
  ]);
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
      import { unzip } from ${JSON.stringify(distModuleUrl)};
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
      import { unzip } from ${JSON.stringify(distModuleUrl)};
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
      import { unzip } from ${JSON.stringify(distModuleUrl)};
      await assert.rejects(() => unzip(Buffer.from("PK", "utf8")), /Failed to read zip entry/);
    `,
  });
  assert.equal(run.status, 0, `stdout:\\n${run.stdout}\\nstderr:\\n${run.stderr}`);
});

function createTarGz(entries) {
  const blocks = [];
  for (const entry of entries) {
    const data = Buffer.from(entry.content ?? "");
    const header = Buffer.alloc(512);
    const fileName = entry.fileName ?? "";
    header.write(fileName, 0, Math.min(fileName.length, 100), "utf8");
    header.write("0000644\0", 100, 8, "utf8");
    header.write("0000000\0", 108, 8, "utf8");
    header.write("0000000\0", 116, 8, "utf8");
    header.write(`${data.length.toString(8).padStart(11, "0")}\0`, 124, 12, "utf8");
    header.write("00000000000\0", 136, 12, "utf8");
    header.write("        ", 148, 8, "utf8");
    header.write(entry.typeFlag ?? "0", 156, 1, "utf8");
    if (entry.prefix) {
      header.write(entry.prefix, 345, Math.min(entry.prefix.length, 155), "utf8");
    }
    header.write("ustar\0", 257, 6, "utf8");
    header.write("00", 263, 2, "utf8");
    let checksum = 0;
    for (const byte of header) {
      checksum += byte;
    }
    header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8, "utf8");
    blocks.push(header, data);
    const pad = (512 - (data.length % 512)) % 512;
    if (pad > 0) {
      blocks.push(Buffer.alloc(pad));
    }
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

test("untarGz roundtrip extracts files and skips directories", async () => {
  const archive = createTarGz([
    { fileName: "dir/", content: "", typeFlag: "5" },
    { fileName: "dir/a.txt", content: "hello" },
    { fileName: "b.txt", content: "world", prefix: "nested" },
    { fileName: "n".repeat(100), content: "full" },
  ]);
  const files = await untarGz(archive);
  assert.equal(files.get("dir/a.txt")?.toString("utf8"), "hello");
  assert.equal(files.get("nested/b.txt")?.toString("utf8"), "world");
  assert.equal(files.get("n".repeat(100))?.toString("utf8"), "full");
});

test("untarGz rejects invalid limits and unsafe entries", async () => {
  const archive = createTarGz([{ fileName: "a.txt", content: "hello" }]);
  await assert.rejects(() => untarGz(archive, { maxFiles: 0 }), /max_files must be positive/);
  await assert.rejects(
    () => untarGz(archive, { maxTotalUncompressedSize: 0 }),
    /max_total_uncompressed_size must be positive/,
  );
  await assert.rejects(
    () => untarGz(archive, { maxFileUncompressedSize: 0 }),
    /max_file_uncompressed_size must be positive/,
  );
  await assert.rejects(
    () => untarGz(archive, { maxCompressionRatio: 0 }),
    /max_compression_ratio must be positive/,
  );
  await assert.rejects(
    () => untarGz(createTarGz([{ fileName: "../etc/passwd", content: "x" }])),
    /unsafe/,
  );
  await assert.rejects(
    () => untarGz(createTarGz([{ fileName: "/etc/passwd", content: "x" }])),
    /relative/,
  );
  await assert.rejects(
    () => untarGz(createTarGz([{ fileName: "C:foo", content: "x" }])),
    /relative/,
  );
  await assert.rejects(
    () => untarGz(createTarGz([{ fileName: "link", content: "", typeFlag: "2" }])),
    /regular file/,
  );
  await assert.rejects(() => untarGz(Buffer.from("not-gzip")), /Failed to open tar.gz buffer/);
  await assert.rejects(() => untarGz(createTarGz([{ fileName: "", content: "x" }])), /unsafe/);
  await assert.rejects(
    () =>
      untarGz(
        gzipSync(
          Buffer.concat([
            (() => {
              const header = Buffer.alloc(512);
              header.write("trunc.txt", 0, 9, "utf8");
              header.write(`${(100).toString(8).padStart(11, "0")}\0`, 124, 12, "utf8");
              header.write("0", 156, 1, "utf8");
              return header;
            })(),
          ]),
        ),
      ),
    /could not be read/,
  );
  const emptySize = Buffer.alloc(512);
  emptySize.write("empty-size.txt", 0, 14, "utf8");
  emptySize.write("0", 156, 1, "utf8");
  const emptySizeFiles = await untarGz(gzipSync(Buffer.concat([emptySize, Buffer.alloc(1024)])));
  assert.equal(emptySizeFiles.get("empty-size.txt")?.length, 0);
  const invalidSize = Buffer.alloc(512);
  invalidSize.write("zero.txt", 0, 8, "utf8");
  invalidSize.write("not-octal!!\0", 124, 12, "utf8");
  invalidSize.write("0", 156, 1, "utf8");
  const zeroFiles = await untarGz(gzipSync(Buffer.concat([invalidSize, Buffer.alloc(1024)])));
  assert.equal(zeroFiles.get("zero.txt")?.length, 0);
});

test("untarGz enforces size and compression ratio limits", async () => {
  const archive = createTarGz([
    { fileName: "a.txt", content: "hello" },
    { fileName: "b.txt", content: "world" },
  ]);
  await assert.rejects(() => untarGz(archive, { maxFiles: 1 }), /too many files/);
  await assert.rejects(
    () => untarGz(archive, { maxFileUncompressedSize: 2 }),
    /max_file_uncompressed_size/,
  );
  await assert.rejects(
    () => untarGz(archive, { maxTotalUncompressedSize: 6 }),
    /max_total_uncompressed_size/,
  );
  const compressible = createTarGz([{ fileName: "bomb.txt", content: Buffer.alloc(20_000, 65) }]);
  await assert.rejects(
    () => untarGz(compressible, { maxCompressionRatio: 1 }),
    /max_compression_ratio/,
  );
  const files = await untarGz(
    createTarGz([
      { fileName: "empty.txt", content: "", typeFlag: "\0" },
      { fileName: "skip-dir/", content: "", typeFlag: "0" },
    ]),
    { maxCompressionRatio: null },
  );
  assert.equal(files.get("empty.txt")?.length, 0);
  assert.equal(files.has("skip-dir"), false);
});
