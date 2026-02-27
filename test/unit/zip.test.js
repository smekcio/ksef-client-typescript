import assert from "node:assert/strict";
import { test } from "node:test";
import { createZip, unzip } from "../../dist/index.js";

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
