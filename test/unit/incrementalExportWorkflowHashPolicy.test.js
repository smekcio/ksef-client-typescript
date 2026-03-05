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

test("IncrementalExportWorkflow forwards polling options and iterates when continuation point advances", async () => {
  const waitCalls = [];
  const startCalls = [];
  const workflow = new IncrementalExportWorkflow({
    startExport: async ({ filters }) => {
      startCalls.push(filters.dateRange.from);
      return {
        referenceNumber: `REF-${startCalls.length}`,
        encryptionData: {},
      };
    },
    waitForExport: async (_referenceNumber, waitOptions) => {
      waitCalls.push(waitOptions);
      if (waitCalls.length === 1) {
        return {
          status: { code: 200, description: "OK" },
          package: {
            isTruncated: false,
            permanentStorageHwmDate: "2026-01-01T01:00:00Z",
          },
        };
      }
      return {
        status: { code: 200, description: "OK" },
        package: {},
      };
    },
    downloadAndProcessPackage: async () => ({
      metadataSummaries: [{ ksefNumber: `KSEF-${waitCalls.length}` }],
      invoiceXmlFiles: {},
    }),
  });

  const continuationPoints = {};
  const result = await workflow.run({
    subjectType: "Subject1",
    windowFrom: "2026-01-01T00:00:00Z",
    windowTo: "2026-01-02T00:00:00Z",
    continuationPoints,
    maxIterations: 3,
    pollIntervalMs: 1,
    maxAttempts: 2,
  });

  assert.ok(waitCalls.length >= 2);
  assert.deepEqual(waitCalls[0], { pollIntervalMs: 1, maxAttempts: 2 });
  assert.deepEqual(waitCalls[1], { pollIntervalMs: 1, maxAttempts: 2 });
  assert.deepEqual(startCalls.slice(0, 2), ["2026-01-01T00:00:00Z", "2026-01-01T01:00:00Z"]);
  assert.ok(result.referenceNumbers.length >= 2);
});

test("IncrementalExportWorkflow uses filtersFactory and tolerates missing package payload", async () => {
  let capturedFilters = null;
  const workflow = new IncrementalExportWorkflow({
    startExport: async ({ filters }) => {
      capturedFilters = filters;
      return { referenceNumber: "REF-CUSTOM", encryptionData: {} };
    },
    waitForExport: async () => ({
      status: { code: 200, description: "OK" },
    }),
    downloadAndProcessPackage: async () => ({
      metadataSummaries: [],
      invoiceXmlFiles: {},
    }),
  });

  await workflow.run({
    subjectType: "Subject1",
    windowFrom: "2026-01-01T00:00:00Z",
    windowTo: "2026-01-02T00:00:00Z",
    continuationPoints: {},
    maxIterations: 1,
    filtersFactory: (from, to) => ({
      subjectType: "Subject1",
      dateRange: {
        dateType: "Issue",
        from,
        to,
      },
    }),
  });

  assert.deepEqual(capturedFilters, {
    subjectType: "Subject1",
    dateRange: {
      dateType: "Issue",
      from: "2026-01-01T00:00:00Z",
      to: "2026-01-02T00:00:00Z",
    },
  });
});
