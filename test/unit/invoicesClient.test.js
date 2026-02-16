import assert from "node:assert/strict";
import { test } from "node:test";
import { InvoicesClient } from "../../dist/index.js";

test("exportInvoices sets include-metadata feature header when includeMetadata is enabled", async () => {
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
        from: "2025-01-01",
        to: "2025-03-31",
      },
    },
    includeMetadata: true,
  });

  assert.equal(capturedOptions.path, "/invoices/exports");
  assert.equal(capturedOptions.headers["X-KSeF-Feature"], "include-metadata");
  assert.equal(capturedOptions.body.includeMetadata, undefined);
});
