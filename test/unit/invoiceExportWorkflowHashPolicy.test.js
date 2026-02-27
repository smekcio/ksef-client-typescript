import assert from "node:assert/strict";
import { test } from "node:test";
import { CryptographyService, InvoiceExportWorkflow, KsefError } from "../../dist/index.js";

function buildPart(overrides = {}) {
  return {
    ordinalNumber: 1,
    partName: "part-1.bin",
    method: "GET",
    url: "https://uploads.example.com/part-1.bin",
    partSize: 0,
    partHash: "unused",
    encryptedPartSize: 0,
    encryptedPartHash: "",
    expirationDate: "2099-01-01T00:00:00Z",
    ...overrides,
  };
}

test("InvoiceExportWorkflow requires encryptedPartHash by default", async () => {
  const payload = Buffer.from("encrypted-bytes");
  const http = {
    request: async () => payload,
  };
  const workflow = new InvoiceExportWorkflow({}, {}, http);

  await assert.rejects(
    () => workflow.downloadParts([buildPart()]),
    (error) => {
      assert.ok(error instanceof KsefError);
      assert.match(error.message, /Missing encrypted part hash/);
      return true;
    },
  );
});

test("InvoiceExportWorkflow can disable required hash policy", async () => {
  const payload = Buffer.from("encrypted-bytes");
  const http = {
    request: async () => payload,
  };
  const workflow = new InvoiceExportWorkflow({}, {}, http, {
    requireExportPartHash: false,
  });

  const parts = await workflow.downloadParts([buildPart()]);
  assert.equal(parts.length, 1);
  assert.equal(parts[0].toString("utf8"), "encrypted-bytes");
});

test("InvoiceExportWorkflow detects encrypted part hash mismatch", async () => {
  const payload = Buffer.from("encrypted-bytes");
  const validHash = CryptographyService.sha256Base64(payload);
  const http = {
    request: async () => payload,
  };
  const workflow = new InvoiceExportWorkflow({}, {}, http);

  const valid = await workflow.downloadParts([
    buildPart({
      encryptedPartHash: validHash,
    }),
  ]);
  assert.equal(valid.length, 1);

  await assert.rejects(
    () =>
      workflow.downloadParts([
        buildPart({
          encryptedPartHash: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        }),
      ]),
    (error) => {
      assert.ok(error instanceof KsefError);
      assert.match(error.message, /hash mismatch/);
      return true;
    },
  );
});
