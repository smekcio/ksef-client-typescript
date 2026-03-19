import assert from "node:assert/strict";
import { test } from "node:test";
import { InvoicesClient } from "../../dist/index.js";

test("exportInvoices sends onlyMetadata in request body", async () => {
  let capturedOptions;
  const http = {
    request: async (options) => {
      capturedOptions = options;
      return {};
    },
  };
  const client = new InvoicesClient(http, async () => "access-token");

  await client.exportInvoices({
    encryption: {
      encryptedSymmetricKey: "BASE64",
      initializationVector: "BASE64",
    },
    filters: {
      subjectType: "Subject1",
      dateRange: {
        dateType: "Issue",
        from: "2025-01-01T00:00:00",
        to: "2025-03-31T23:59:59",
      },
    },
    onlyMetadata: true,
  });

  assert.equal(capturedOptions.path, "/invoices/exports");
  assert.equal(capturedOptions.headers, undefined);
  assert.equal(capturedOptions.body.onlyMetadata, true);
  assert.equal(capturedOptions.body.includeMetadata, undefined);
  assert.equal(capturedOptions.body.filters.dateRange.from, "2025-01-01T00:00:00+01:00");
  assert.equal(capturedOptions.body.filters.dateRange.to, "2025-03-31T23:59:59+02:00");
});

test("exportInvoices maps legacy includeMetadata to onlyMetadata body field", async () => {
  let capturedOptions;
  const http = {
    request: async (options) => {
      capturedOptions = options;
      return {};
    },
  };
  const client = new InvoicesClient(http, async () => "access-token");

  await client.exportInvoices({
    encryption: {
      encryptedSymmetricKey: "BASE64",
      initializationVector: "BASE64",
    },
    filters: {
      subjectType: "Subject1",
      dateRange: {
        dateType: "Issue",
        from: "2025-01-01T00:00:00Z",
        to: "2025-01-02T00:00:00Z",
      },
    },
    includeMetadata: true,
  });

  assert.equal(capturedOptions.path, "/invoices/exports");
  assert.equal(capturedOptions.headers, undefined);
  assert.equal(capturedOptions.body.onlyMetadata, true);
  assert.equal(capturedOptions.body.includeMetadata, undefined);
});

test("queryInvoiceMetadata normalizes datetime without offset to Europe/Warsaw offset", async () => {
  let capturedOptions;
  const http = {
    request: async (options) => {
      capturedOptions = options;
      return {};
    },
  };
  const client = new InvoicesClient(http, async () => "access-token");

  await client.queryInvoiceMetadata({
    subjectType: "Subject1",
    dateRange: {
      dateType: "Issue",
      from: "2025-03-29T10:15:00",
      to: "2025-03-30T11:15:00",
    },
  });

  assert.equal(capturedOptions.path, "/invoices/query/metadata");
  assert.equal(capturedOptions.body.dateRange.from, "2025-03-29T10:15:00+01:00");
  assert.equal(capturedOptions.body.dateRange.to, "2025-03-30T11:15:00+02:00");
});

test("invoice endpoints use expected paths and normalize legacy includeMetadata=false", async () => {
  const calls = [];
  const http = {
    request: async (options) => {
      calls.push(options);
      return {};
    },
  };
  const client = new InvoicesClient(http, async () => "access-token");

  await client.getInvoice("KSEF/1");
  await client.exportInvoices({
    encryption: {
      encryptedSymmetricKey: "BASE64",
      initializationVector: "BASE64",
    },
    filters: {
      subjectType: "Subject1",
      dateRange: {
        dateType: "Issue",
        from: "2025-01-01T00:00:00Z",
        to: "2025-01-02T00:00:00Z",
      },
    },
    includeMetadata: false,
  });
  await client.getInvoiceExportStatus("EXP/1");

  assert.deepEqual(
    calls.map((options) => [options.method, options.path]),
    [
      ["GET", "/invoices/ksef/KSEF%2F1"],
      ["POST", "/invoices/exports"],
      ["GET", "/invoices/exports/EXP%2F1"],
    ],
  );
  assert.equal(calls[0].responseType, "text");
  assert.equal(calls[0].headers.Accept, "application/xml");
  assert.equal("headers" in calls[1], false);
  assert.equal(calls[1].body.onlyMetadata, false);
  assert.equal(calls[1].body.includeMetadata, undefined);
  assert.equal(calls[2].authToken, "access-token");
});
