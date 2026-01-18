import assert from "node:assert/strict";
import { test } from "node:test";
import { KsefClient } from "../../dist/index.js";

const env = process.env.KSEF_ENV;
const token = process.env.KSEF_TOKEN;
const contextType = process.env.KSEF_CONTEXT_TYPE;
const contextValue = process.env.KSEF_CONTEXT_VALUE;

const hasAuth = env && token && contextType && contextValue;

test("e2e connect and query metadata", async (t) => {
  if (!hasAuth) {
    t.skip("Missing KSEF_ENV/KSEF_TOKEN/KSEF_CONTEXT_TYPE/KSEF_CONTEXT_VALUE");
    return;
  }

  const client = await KsefClient.connect({
    environment: env,
    token,
    context: { type: contextType, value: contextValue },
  });

  const now = new Date();
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const result = await client.invoices.queryInvoiceMetadata(
    {
      subjectType: "Subject1",
      dateRange: {
        dateType: "Issue",
        from: from.toISOString(),
        to: now.toISOString(),
      },
    },
    0,
    10,
    "Desc",
  );

  assert.ok(result);
});
