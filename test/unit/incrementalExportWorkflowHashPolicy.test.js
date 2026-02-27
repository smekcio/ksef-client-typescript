import assert from "node:assert/strict";
import { test } from "node:test";
import { IncrementalExportWorkflow } from "../../dist/index.js";

function createExportsWorkflowMock(capturedDownloadOptions) {
  return {
    startExport: async () => ({
      referenceNumber: "REF-1",
      encryptionData: {},
    }),
    waitForExport: async () => ({
      status: {
        code: 200,
        description: "OK",
      },
      package: {},
    }),
    downloadAndProcessPackage: async (_status, _encryptionData, options) => {
      capturedDownloadOptions.push(options);
      return {
        metadataSummaries: [{ ksefNumber: "KSEF-1" }],
        invoiceXmlFiles: { "invoice-1.xml": "<Invoice/>" },
      };
    },
  };
}

test("IncrementalExportWorkflow prefers requireExportPartHash over verifyHashes", async () => {
  const captured = [];
  const workflow = new IncrementalExportWorkflow(createExportsWorkflowMock(captured));

  await workflow.run({
    subjectType: "Subject1",
    windowFrom: "2026-01-01T00:00:00Z",
    windowTo: "2026-01-02T00:00:00Z",
    continuationPoints: {},
    requireExportPartHash: false,
    verifyHashes: true,
  });

  assert.equal(captured.length, 1);
  assert.deepEqual(captured[0], { requireExportPartHash: false });
});

test("IncrementalExportWorkflow falls back to verifyHashes when requireExportPartHash is undefined", async () => {
  const captured = [];
  const workflow = new IncrementalExportWorkflow(createExportsWorkflowMock(captured));

  await workflow.run({
    subjectType: "Subject1",
    windowFrom: "2026-01-01T00:00:00Z",
    windowTo: "2026-01-02T00:00:00Z",
    continuationPoints: {},
    verifyHashes: false,
  });

  assert.equal(captured.length, 1);
  assert.deepEqual(captured[0], { verifyHashes: false });
});
