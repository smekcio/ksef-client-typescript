import assert from "node:assert/strict";
import { test } from "node:test";
import { LimitsClient } from "../../dist/index.js";

test("limits endpoints use expected paths and auth token", async () => {
  const calls = [];
  const http = {
    request: async (options) => {
      calls.push(options);
      return {};
    },
  };
  const client = new LimitsClient(http, async () => "access-token");

  await client.getContextLimits();
  await client.getSubjectLimits();
  await client.getRateLimits();

  assert.deepEqual(
    calls.map((options) => ({
      method: options.method,
      path: options.path,
      authToken: options.authToken,
    })),
    [
      { method: "GET", path: "/limits/context", authToken: "access-token" },
      { method: "GET", path: "/limits/subject", authToken: "access-token" },
      { method: "GET", path: "/rate-limits", authToken: "access-token" },
    ],
  );
});

test("limits testdata endpoints use expected methods, paths and body", async () => {
  const calls = [];
  const http = {
    request: async (options) => {
      calls.push(options);
      return {};
    },
  };
  const client = new LimitsClient(http, async () => "access-token");
  const request = { concurrentSessionsLimit: 10 };

  await client.changeContextSessionLimits(request);
  await client.restoreContextSessionLimits();
  await client.changeSubjectCertificateLimits(request);
  await client.restoreSubjectCertificateLimits();
  await client.changeRateLimits(request);
  await client.restoreRateLimits();
  await client.setRateLimitsProduction(request);

  assert.deepEqual(
    calls.map((options) => ({
      method: options.method,
      path: options.path,
      authToken: options.authToken,
      hasBody: "body" in options,
    })),
    [
      {
        method: "POST",
        path: "/testdata/limits/context/session",
        authToken: "access-token",
        hasBody: true,
      },
      {
        method: "DELETE",
        path: "/testdata/limits/context/session",
        authToken: "access-token",
        hasBody: false,
      },
      {
        method: "POST",
        path: "/testdata/limits/subject/certificate",
        authToken: "access-token",
        hasBody: true,
      },
      {
        method: "DELETE",
        path: "/testdata/limits/subject/certificate",
        authToken: "access-token",
        hasBody: false,
      },
      {
        method: "POST",
        path: "/testdata/rate-limits",
        authToken: "access-token",
        hasBody: true,
      },
      {
        method: "DELETE",
        path: "/testdata/rate-limits",
        authToken: "access-token",
        hasBody: false,
      },
      {
        method: "POST",
        path: "/testdata/rate-limits/production",
        authToken: "access-token",
        hasBody: true,
      },
    ],
  );
  assert.deepEqual(calls[0].body, request);
  assert.deepEqual(calls[2].body, request);
  assert.deepEqual(calls[4].body, request);
  assert.deepEqual(calls[6].body, request);
});
