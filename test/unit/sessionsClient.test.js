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
