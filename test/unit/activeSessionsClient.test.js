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

test("listActiveSessions normalizes authenticationMethodInfo for legacy session items", async () => {
  const http = {
    request: async () => ({
      items: [
        {
          startDate: "2026-02-19T10:00:00Z",
          referenceNumber: "ref-1",
          authenticationMethod: "TrustedProfile",
          status: { code: 200, description: "ok" },
        },
      ],
    }),
  };
  const client = new ActiveSessionsClient(http, async () => "access-token");

  const response = await client.listActiveSessions();

  assert.deepEqual(response.items[0].authenticationMethodInfo, {
    category: "NationalNode",
    code: "TrustedProfile",
    displayName: "Profil Zaufany / Węzeł Krajowy",
  });
});

test("listActiveSessions omits continuation header when token is not provided", async () => {
  let capturedOptions;
  const http = {
    request: async (options) => {
      capturedOptions = options;
      return { items: [] };
    },
  };
  const client = new ActiveSessionsClient(http, async () => "access-token");

  await client.listActiveSessions();

  assert.equal(capturedOptions.method, "GET");
  assert.equal(capturedOptions.path, "/auth/sessions");
  assert.equal("headers" in capturedOptions, false);
  assert.deepEqual(capturedOptions.query, { pageSize: undefined });
});

test("active session revoke endpoints use expected methods and encoded paths", async () => {
  const calls = [];
  const http = {
    request: async (options) => {
      calls.push(options);
      return {};
    },
  };
  const client = new ActiveSessionsClient(http, async () => "access-token");

  await client.revokeCurrentSession();
  await client.revokeSession("REF/1");

  assert.deepEqual(
    calls.map((options) => [options.method, options.path, options.authToken]),
    [
      ["DELETE", "/auth/sessions/current", "access-token"],
      ["DELETE", "/auth/sessions/REF%2F1", "access-token"],
    ],
  );
});
