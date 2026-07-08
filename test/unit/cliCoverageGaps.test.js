import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distCliPath = path.resolve(__dirname, "../../dist/cli/index.js");
const distCliMapPath = path.resolve(__dirname, "../../dist/cli/index.js.map");
const distRootPath = path.resolve(__dirname, "../../dist");

async function loadCliCoverageModule(extraExports = "") {
  const tempBaseDir = path.resolve(__dirname, "../../.tmp");
  await mkdir(tempBaseDir, { recursive: true });
  const tempDir = await mkdtemp(path.join(tempBaseDir, "ksef-cli-cov-"));
  const tempModulePath = path.join(tempDir, "index.js");
  const tempMapPath = path.join(tempDir, "index.js.map");

  try {
    const distEntries = await readdir(distRootPath, { withFileTypes: true });
    for (const entry of distEntries) {
      if (!entry.isFile() || !entry.name.endsWith(".js")) {
        continue;
      }
      if (!entry.name.startsWith("chunk-") && !entry.name.startsWith("libxmljs2-")) {
        continue;
      }
      await copyFile(path.join(distRootPath, entry.name), path.join(tempBaseDir, entry.name));
    }

    const source = await readFile(distCliPath, "utf8");
    const withoutSourceMapComment = source.replace(/\n\/\/# sourceMappingURL=index\.js\.map\s*$/u, "");
    const patched = `${withoutSourceMapComment}
export {
  extractKsefNumber,
  resolveOutputPath,
  listXmlFilesRecursive,
  waitForInvoiceUpo,
  formatSessionIdError,
  SessionStoreError,
  ${extraExports}
};
//# sourceMappingURL=index.js.map
`;

    await writeFile(tempModulePath, patched, "utf8");
    await copyFile(distCliMapPath, tempMapPath);

    const moduleUrl = `${pathToFileURL(tempModulePath).href}?cacheBust=${Date.now()}`;
    const loaded = await import(moduleUrl);

    return {
      module: loaded,
      dispose: async () => {
        await rm(tempDir, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}

test("CLI internals: formatSessionIdError handles Error and non-Error values", async () => {
  const loaded = await loadCliCoverageModule();
  try {
    const { formatSessionIdError, SessionStoreError } = loaded.module;
    assert.equal(formatSessionIdError(new SessionStoreError("bad id", "validation")), "bad id");
    assert.equal(formatSessionIdError("string-boom"), "string-boom");
  } finally {
    await loaded.dispose();
  }
});

test("CLI internals: extractKsefNumber and resolveOutputPath branches", async () => {
  const loaded = await loadCliCoverageModule();
  try {
    const { extractKsefNumber, resolveOutputPath } = loaded.module;
    assert.equal(extractKsefNumber(null), null);
    assert.equal(extractKsefNumber("not-object"), null);
    assert.equal(extractKsefNumber({ ksefNumber: "K-1" }), "K-1");
    assert.equal(extractKsefNumber({ invoice: { ksefNumber: "K-2" } }), "K-2");

    const trailing = resolveOutputPath(path.join(os.tmpdir(), "outdir/"), "file.xml");
    assert.ok(trailing.endsWith(`${path.sep}file.xml`));
    const direct = resolveOutputPath("/tmp/file.xml", "ignored.xml");
    assert.equal(direct, "/tmp/file.xml");
  } finally {
    await loaded.dispose();
  }
});

test("CLI internals: listXmlFilesRecursive sorts nested xml files", async () => {
  const loaded = await loadCliCoverageModule();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ksef-cli-xml-"));
  try {
    const { listXmlFilesRecursive } = loaded.module;
    const nested = path.join(tempDir, "nested");
    await mkdir(nested, { recursive: true });
    await writeFile(path.join(nested, "b.xml"), "<a/>", "utf8");
    await writeFile(path.join(tempDir, "a.xml"), "<a/>", "utf8");
    await writeFile(path.join(tempDir, "skip.txt"), "x", "utf8");

    const files = await listXmlFilesRecursive(tempDir);
    assert.deepEqual(
      files.map((file) => path.basename(file)),
      ["a.xml", "b.xml"],
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
    await loaded.dispose();
  }
});

test("CLI internals: waitForInvoiceUpo timeout with non-Error failure", async () => {
  const loaded = await loadCliCoverageModule();
  try {
    const { waitForInvoiceUpo } = loaded.module;
    const handle = {
      getInvoiceUpoByReference: async () => {
        throw "upo-string-failure";
      },
    };
    await assert.rejects(
      () => waitForInvoiceUpo(handle, "INV-1", 1, 1),
      (error) => error.message === "Timed out while waiting for invoice UPO.",
    );
  } finally {
    await loaded.dispose();
  }
});
