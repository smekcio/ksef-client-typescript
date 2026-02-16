import assert from "node:assert/strict";
import { test } from "node:test";
import { PeppolClient } from "../../dist/index.js";

test("queryProviders maps pageOffset/pageSize to query params", async () => {
  let capturedOptions;
  const http = {
    request: async (options) => {
      capturedOptions = options;
      return {};
    },
  };
  const client = new PeppolClient(http, async () => "access-token");

  await client.queryProviders(20, 100);

  assert.equal(capturedOptions.method, "GET");
  assert.equal(capturedOptions.path, "/peppol/query");
  assert.deepEqual(capturedOptions.query, {
    pageOffset: 20,
    pageSize: 100,
  });
  assert.equal(capturedOptions.authToken, undefined);
});
