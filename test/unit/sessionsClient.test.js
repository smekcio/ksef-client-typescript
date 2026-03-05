import assert from "node:assert/strict";
import { test } from "node:test";
import { SessionsClient } from "../../dist/index.js";

test("getSessions sends required sessionType and optional filters in query", async () => {
  let capturedOptions;
  const http = {
    request: async (options) => {
      capturedOptions = options;
      return {};
    },
  };
  const client = new SessionsClient(http, async () => "access-token");

  await client.getSessions(
    {
      sessionType: "Online",
      referenceNumber: "SE/REF/123",
      dateCreatedFrom: "2025-01-01T00:00:00Z",
      dateCreatedTo: "2025-01-31T23:59:59Z",
      dateClosedFrom: "2025-02-01T00:00:00Z",
      dateClosedTo: "2025-02-28T23:59:59Z",
      dateModifiedFrom: "2025-03-01T00:00:00Z",
      dateModifiedTo: "2025-03-31T23:59:59Z",
      statuses: ["InProgress", "Failed"],
      pageSize: 50,
    },
    "next-page-token",
  );

  assert.equal(capturedOptions.path, "/sessions");
  assert.equal(capturedOptions.query.sessionType, "Online");
  assert.equal(capturedOptions.query.referenceNumber, "SE/REF/123");
  assert.equal(capturedOptions.query.dateCreatedFrom, "2025-01-01T00:00:00Z");
  assert.equal(capturedOptions.query.dateCreatedTo, "2025-01-31T23:59:59Z");
  assert.equal(capturedOptions.query.dateClosedFrom, "2025-02-01T00:00:00Z");
  assert.equal(capturedOptions.query.dateClosedTo, "2025-02-28T23:59:59Z");
  assert.equal(capturedOptions.query.dateModifiedFrom, "2025-03-01T00:00:00Z");
  assert.equal(capturedOptions.query.dateModifiedTo, "2025-03-31T23:59:59Z");
  assert.deepEqual(capturedOptions.query.statuses, ["InProgress", "Failed"]);
  assert.equal(capturedOptions.query.pageSize, 50);
  assert.equal(capturedOptions.headers["x-continuation-token"], "next-page-token");
});

test("getSessions omits continuation token header when not provided", async () => {
  let capturedOptions;
  const http = {
    request: async (options) => {
      capturedOptions = options;
      return {};
    },
  };
  const client = new SessionsClient(http, async () => "access-token");

  await client.getSessions({ sessionType: "Batch" });

  assert.equal(capturedOptions.path, "/sessions");
  assert.equal(capturedOptions.query.sessionType, "Batch");
  assert.equal("headers" in capturedOptions, false);
});

test("openOnlineSession toggles upo-v4-3 feature header based on upoV43 flag", async () => {
  const calls = [];
  const http = {
    request: async (options) => {
      calls.push(options);
      return {};
    },
  };
  const client = new SessionsClient(http, async () => "access-token");
  const request = { formCode: "FA(2)" };

  await client.openOnlineSession(request, true);
  await client.openOnlineSession(request, false);

  assert.equal(calls[0].path, "/sessions/online");
  assert.deepEqual(calls[0].headers, { "X-KSeF-Feature": "upo-v4-3" });
  assert.equal(calls[1].path, "/sessions/online");
  assert.equal("headers" in calls[1], false);
});

test("sessions endpoints use expected paths, methods and optional headers", async () => {
  const calls = [];
  const http = {
    request: async (options) => {
      calls.push(options);
      return {};
    },
  };
  const client = new SessionsClient(http, async () => "access-token");

  await client.getSessionStatus("SESSION/1");
  await client.getSessionInvoices("SESSION/1", 10, 20, "cont-1");
  await client.getSessionInvoices("SESSION/2");
  await client.getSessionInvoiceStatus("SESSION/1", "INV/1");
  await client.getSessionInvoiceUpoByReferenceNumber("SESSION/1", "INV/1");
  await client.getSessionInvoiceUpoByKsefNumber("SESSION/1", "KSEF/123");
  await client.getSessionUpo("SESSION/1", "UPO/999");
  await client.getSessionFailedInvoices("SESSION/1", 30, "cont-2");
  await client.getSessionFailedInvoices("SESSION/2");
  await client.sendOnlineInvoice("SESSION/1", { invoiceHash: { hashSHA: { algorithm: "SHA-256", encoding: "Base64", value: "abc" } }, invoicePayload: { type: "Plain", invoiceBody: "<xml/>" } });
  await client.closeOnlineSession("SESSION/1");
  await client.openBatchSession({ formCode: "FA(2)" }, true);
  await client.openBatchSession({ formCode: "FA(2)" }, false);
  await client.closeBatchSession("SESSION/1");

  assert.deepEqual(
    calls.map((options) => [options.method, options.path]),
    [
      ["GET", "/sessions/SESSION%2F1"],
      ["GET", "/sessions/SESSION%2F1/invoices"],
      ["GET", "/sessions/SESSION%2F2/invoices"],
      ["GET", "/sessions/SESSION%2F1/invoices/INV%2F1"],
      ["GET", "/sessions/SESSION%2F1/invoices/INV%2F1/upo"],
      ["GET", "/sessions/SESSION%2F1/invoices/ksef/KSEF%2F123/upo"],
      ["GET", "/sessions/SESSION%2F1/upo/UPO%2F999"],
      ["GET", "/sessions/SESSION%2F1/invoices/failed"],
      ["GET", "/sessions/SESSION%2F2/invoices/failed"],
      ["POST", "/sessions/online/SESSION%2F1/invoices"],
      ["POST", "/sessions/online/SESSION%2F1/close"],
      ["POST", "/sessions/batch"],
      ["POST", "/sessions/batch"],
      ["POST", "/sessions/batch/SESSION%2F1/close"],
    ],
  );
  assert.equal(calls[1].headers["x-continuation-token"], "cont-1");
  assert.deepEqual(calls[1].query, { pageOffset: 10, pageSize: 20 });
  assert.deepEqual(calls[2].query, { pageOffset: undefined, pageSize: undefined });
  assert.equal(calls[4].headers.Accept, "application/xml");
  assert.equal(calls[4].responseType, "text");
  assert.equal(calls[5].headers.Accept, "application/xml");
  assert.equal(calls[6].headers.Accept, "application/xml");
  assert.equal(calls[7].headers["x-continuation-token"], "cont-2");
  assert.deepEqual(calls[7].query, { pageSize: 30 });
  assert.deepEqual(calls[8].query, { pageSize: undefined });
  assert.equal(calls[11].headers["X-KSeF-Feature"], "upo-v4-3");
  assert.equal("headers" in calls[12], false);
});
