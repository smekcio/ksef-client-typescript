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

test("listTokens omits optional query and continuation headers when not provided", async () => {
  let capturedOptions;
  const http = {
    request: async (options) => {
      capturedOptions = options;
      return {};
    },
  };
  const client = new TokensClient(http, async () => "access-token");

  await client.listTokens();

  assert.equal(capturedOptions.path, "/tokens");
  assert.equal(capturedOptions.authToken, "access-token");
  assert.equal("headers" in capturedOptions, false);
  assert.equal("query" in capturedOptions, false);
});

test("token endpoints use expected methods and encoded paths", async () => {
  const calls = [];
  const http = {
    request: async (options) => {
      calls.push(options);
      return {};
    },
  };
  const client = new TokensClient(http, async () => "access-token");

  const request = { description: "token", contextIdentifier: { type: "Nip", value: "1234567890" } };
  await client.generateToken(request);
  await client.getToken("REF/1");
  await client.revokeToken("REF/1");

  assert.deepEqual(
    calls.map((options) => [options.method, options.path]),
    [
      ["POST", "/tokens"],
      ["GET", "/tokens/REF%2F1"],
      ["DELETE", "/tokens/REF%2F1"],
    ],
  );
  assert.deepEqual(calls[0].body, request);
});
