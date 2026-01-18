import assert from "node:assert/strict";
import { test } from "node:test";
import { KsefClient } from "../../dist/index.js";

const env = process.env.KSEF_ENV;
const token = process.env.KSEF_TOKEN;
const contextType = process.env.KSEF_CONTEXT_TYPE;
const contextValue = process.env.KSEF_CONTEXT_VALUE;
const fullE2e = process.env.KSEF_E2E_FULL === "1";

const subjectType = process.env.KSEF_E2E_INCREMENTAL_SUBJECT_TYPE;
const windowFrom = process.env.KSEF_E2E_INCREMENTAL_FROM;
const windowTo = process.env.KSEF_E2E_INCREMENTAL_TO;
const filtersTemplateJson = process.env.KSEF_E2E_INCREMENTAL_FILTERS_TEMPLATE_JSON;

const hasAuth = env && token && contextType && contextValue;

function buildFiltersFactory(templateJson) {
  return (from, to) => {
    const rendered = templateJson.replace(/\$from/g, from).replace(/\$to/g, to);
    return JSON.parse(rendered);
  };
}

test("e2e incremental export workflow", async (t) => {
  if (!hasAuth || !fullE2e) {
    t.skip("Missing credentials or KSEF_E2E_FULL=1");
    return;
  }
  if (!subjectType || !windowFrom || !windowTo || !filtersTemplateJson) {
    t.skip("Missing KSEF_E2E_INCREMENTAL_* vars (SUBJECT_TYPE, FROM, TO, FILTERS_TEMPLATE_JSON)");
    return;
  }

  let filtersFactory;
  try {
    filtersFactory = buildFiltersFactory(filtersTemplateJson);
    filtersFactory(windowFrom, windowTo);
  } catch {
    t.skip("Invalid KSEF_E2E_INCREMENTAL_FILTERS_TEMPLATE_JSON");
    return;
  }

  const client = await KsefClient.connect({
    environment: env,
    token,
    context: { type: contextType, value: contextValue },
  });

  const points = {};
  const result = await client.workflows.exportsIncremental.run({
    subjectType,
    windowFrom,
    windowTo,
    continuationPoints: points,
    filtersFactory,
    maxIterations: 5,
  });

  assert.ok(Array.isArray(result.referenceNumbers));
  assert.ok(Array.isArray(result.metadataSummaries));
});
