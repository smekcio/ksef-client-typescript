import assert from "node:assert/strict";
import { test } from "node:test";
import { ActiveSessionsClient } from "../../dist/index.js";

test("listActiveSessions sends page size and continuation token", async () => {
  let capturedOptions;
  const http = {
    request: async (options) => {
      capturedOptions = options;
      return {};
    },
  };
  const client = new ActiveSessionsClient(http, async () => "access-token");

  await client.listActiveSessions(100, "next-page-token");

  assert.equal(capturedOptions.method, "GET");
  assert.equal(capturedOptions.path, "/auth/sessions");
  assert.deepEqual(capturedOptions.query, {
    pageSize: 100,
  });
  assert.equal(capturedOptions.headers["x-continuation-token"], "next-page-token");
  assert.equal(capturedOptions.authToken, "access-token");
});
