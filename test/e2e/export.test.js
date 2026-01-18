import assert from "node:assert/strict";
import { test } from "node:test";
import { KsefClient } from "../../dist/index.js";

const env = process.env.KSEF_ENV;
const token = process.env.KSEF_TOKEN;
const contextType = process.env.KSEF_CONTEXT_TYPE;
const contextValue = process.env.KSEF_CONTEXT_VALUE;
const fullE2e = process.env.KSEF_E2E_FULL === "1";
const exportFiltersJson = process.env.KSEF_E2E_EXPORT_FILTERS_JSON;

const hasAuth = env && token && contextType && contextValue;

function parseJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

test("e2e export workflow (start -> wait -> download)", async (t) => {
  if (!hasAuth || !fullE2e) {
    t.skip("Missing credentials or KSEF_E2E_FULL=1");
    return;
  }
  if (!exportFiltersJson) {
    t.skip("Missing KSEF_E2E_EXPORT_FILTERS_JSON (provide filters for export)");
    return;
  }

  const filters = parseJson(exportFiltersJson);
  if (!filters) {
    t.skip("Invalid KSEF_E2E_EXPORT_FILTERS_JSON");
    return;
  }

  const client = await KsefClient.connect({
    environment: env,
    token,
    context: { type: contextType, value: contextValue },
  });

  const started = await client.workflows.exports.startExport({ filters });
  assert.ok(started.referenceNumber);

  const status = await client.workflows.exports.waitForExport(started.referenceNumber, {
    maxAttempts: 120,
    pollIntervalMs: 2000,
  });
  assert.equal(status.status?.code, 200);

  const processed = await client.workflows.exports.downloadAndProcessPackage(
    status,
    started.encryptionData,
    { verifyHashes: false },
  );

  assert.ok(Array.isArray(processed.metadataSummaries));
  assert.ok(processed.invoiceXmlFiles && typeof processed.invoiceXmlFiles === "object");
});
