import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { KsefClient } from "../../dist/index.js";

const env = process.env.KSEF_ENV;
const token = process.env.KSEF_TOKEN;
const contextType = process.env.KSEF_CONTEXT_TYPE;
const contextValue = process.env.KSEF_CONTEXT_VALUE;
const fullE2e = process.env.KSEF_E2E_FULL === "1";

const hasAuth = env && token && contextType && contextValue;

const packageRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const workspaceRoot = path.resolve(packageRoot, "..");
const samplePath = path.join(
  workspaceRoot,
  "ksef-invoice-viewer-vue",
  "public",
  "samples",
  "fa-3.xml",
);

function loadInvoiceXml() {
  return fs.readFileSync(samplePath, "utf8");
}

test("e2e online session send invoice", async (t) => {
  if (!hasAuth || !fullE2e) {
    t.skip("Missing credentials or KSEF_E2E_FULL=1");
    return;
  }

  const client = await KsefClient.connect({
    environment: env,
    token,
    context: { type: contextType, value: contextValue },
  });

  const session = await client.workflows.sessions.online.open({
    formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
  });

  const response = await session.sendInvoice({ invoice: loadInvoiceXml() });
  await session.close();

  assert.ok(response.referenceNumber);
});

test("e2e batch session send invoice", async (t) => {
  if (!hasAuth || !fullE2e) {
    t.skip("Missing credentials or KSEF_E2E_FULL=1");
    return;
  }

  const client = await KsefClient.connect({
    environment: env,
    token,
    context: { type: contextType, value: contextValue },
  });

  const batch = await client.workflows.sessions.batch.openUploadAndClose({
    formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
    invoices: [{ fileName: "invoice.xml", invoice: loadInvoiceXml() }],
  });

  assert.ok(batch.referenceNumber);
});
