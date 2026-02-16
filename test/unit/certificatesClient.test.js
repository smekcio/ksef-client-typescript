import assert from "node:assert/strict";
import { test } from "node:test";
import { CertificatesClient } from "../../dist/index.js";

test("queryCertificates sends pagination query params", async () => {
  let capturedOptions;
  const http = {
    request: async (options) => {
      capturedOptions = options;
      return {};
    },
  };
  const client = new CertificatesClient(http, async () => "access-token");
  const request = { queryCriteria: { status: ["ACTIVE"] } };

  await client.queryCertificates(request, 10, 25);

  assert.equal(capturedOptions.method, "POST");
  assert.equal(capturedOptions.path, "/certificates/query");
  assert.deepEqual(capturedOptions.query, {
    pageOffset: 10,
    pageSize: 25,
  });
  assert.deepEqual(capturedOptions.body, request);
});
