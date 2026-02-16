import assert from "node:assert/strict";
import { test } from "node:test";
import { TestdataClient } from "../../dist/index.js";

test("blockContext sends request to /testdata/context/block with request body", async () => {
  const requestBody = { contextIdentifier: { type: "Nip", value: "1111111111" } };
  let capturedOptions;
  const http = {
    request: async (options) => {
      capturedOptions = options;
      return {};
    },
  };
  const client = new TestdataClient(http, async () => "access-token");

  await client.blockContext(requestBody);

  assert.equal(capturedOptions.path, "/testdata/context/block");
  assert.deepEqual(capturedOptions.body, requestBody);
});

test("unblockContext sends request to /testdata/context/unblock", async () => {
  const requestBody = { contextIdentifier: { type: "Nip", value: "1111111111" } };
  let capturedOptions;
  const http = {
    request: async (options) => {
      capturedOptions = options;
      return {};
    },
  };
  const client = new TestdataClient(http, async () => "access-token");

  await client.unblockContext(requestBody);

  assert.equal(capturedOptions.path, "/testdata/context/unblock");
  assert.deepEqual(capturedOptions.body, requestBody);
});
