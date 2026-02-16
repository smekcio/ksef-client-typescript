import assert from "node:assert/strict";
import { test } from "node:test";
import { TokensClient } from "../../dist/index.js";

test("listTokens maps typed params to query and sends continuation token header", async () => {
  let capturedOptions;
  const http = {
    request: async (options) => {
      capturedOptions = options;
      return {};
    },
  };
  const client = new TokensClient(http, async () => "access-token");

  await client.listTokens(
    {
      status: ["Active", "Revoking"],
      description: "operator token",
      authorIdentifier: "5265877635",
      authorIdentifierType: "Nip",
      pageSize: 25,
    },
    "continuation-123",
  );

  assert.equal(capturedOptions.path, "/tokens");
  assert.deepEqual(capturedOptions.query, {
    status: ["Active", "Revoking"],
    description: "operator token",
    authorIdentifier: "5265877635",
    authorIdentifierType: "Nip",
    pageSize: 25,
  });
  assert.equal(capturedOptions.headers["x-continuation-token"], "continuation-123");
});
