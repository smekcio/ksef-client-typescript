import assert from "node:assert/strict";
import { test } from "node:test";
import { KsefClient, OfflineInvoiceWorkflow } from "../../dist/index.js";

test("KsefClient exposes offline workflow facade", () => {
  const client = new KsefClient({ baseUrl: "https://api-demo.ksef.mf.gov.pl/v2" });
  assert.ok(client.workflows.offline instanceof OfflineInvoiceWorkflow);
});
