import assert from "node:assert/strict";
import { test } from "node:test";
import { AuthClient } from "../../dist/index.js";

test("authenticateWithXadesSignature sets X-KSeF-Feature header when enforce flag is enabled", async () => {
  let capturedOptions;
  const http = {
    request: async (options) => {
      capturedOptions = options;
      return {};
    },
  };
  const client = new AuthClient(http);

  await client.authenticateWithXadesSignature("<SignedXml/>", true, true);

  assert.equal(capturedOptions.path, "/auth/xades-signature");
  assert.equal(capturedOptions.headers["X-KSeF-Feature"], "enforce-xades-compliance");
});

test("authenticateWithXadesSignature does not set X-KSeF-Feature header by default", async () => {
  let capturedOptions;
  const http = {
    request: async (options) => {
      capturedOptions = options;
      return {};
    },
  };
  const client = new AuthClient(http);

  await client.authenticateWithXadesSignature("<SignedXml/>", true);

  assert.equal(capturedOptions.path, "/auth/xades-signature");
  assert.equal(capturedOptions.headers["X-KSeF-Feature"], undefined);
});

test("getAuthStatus normalizes authenticationMethodInfo when response contains legacy shape", async () => {
  const http = {
    request: async () => ({
      startDate: "2026-02-19T10:00:00Z",
      authenticationMethod: "Token",
      status: { code: 200, description: "ok" },
    }),
  };
  const client = new AuthClient(http);

  const status = await client.getAuthStatus("ref-1", "authentication-token");

  assert.deepEqual(status.authenticationMethodInfo, {
    category: "Token",
    code: "Token",
    displayName: "Token KSeF",
  });
});

test("getAuthStatus uses generic fallback for unknown authentication method", async () => {
  const http = {
    request: async () => ({
      startDate: "2026-02-19T10:00:00Z",
      authenticationMethod: "FutureMethod",
      status: { code: 200, description: "ok" },
    }),
  };
  const client = new AuthClient(http);

  const status = await client.getAuthStatus("ref-unknown", "authentication-token");

  assert.deepEqual(status.authenticationMethodInfo, {
    category: "Other",
    code: "FutureMethod",
    displayName: "FutureMethod",
  });
});

test("authenticateWithXadesSignature omits verifyCertificateChain query when not provided", async () => {
  let capturedOptions;
  const http = {
    request: async (options) => {
      capturedOptions = options;
      return {};
    },
  };
  const client = new AuthClient(http);

  await client.authenticateWithXadesSignature("<SignedXml/>");

  assert.equal(capturedOptions.path, "/auth/xades-signature");
  assert.equal("query" in capturedOptions, false);
});

test("auth endpoints use expected methods, paths and auth token forwarding", async () => {
  const calls = [];
  const http = {
    request: async (options) => {
      calls.push(options);
      return {
        startDate: "2026-02-19T10:00:00Z",
        authenticationMethod: "Token",
        status: { code: 200, description: "ok" },
      };
    },
  };
  const client = new AuthClient(http);

  const authRequest = {
    challenge: "challenge-value",
    contextIdentifier: { type: "Nip", value: "1234567890" },
    encryptedToken: "encrypted",
  };
  await client.getChallenge();
  await client.authenticateWithKsefToken(authRequest);
  await client.getAuthStatus("REF/1", "auth-token");
  await client.redeemToken("auth-token");
  await client.refreshAccessToken("refresh-token");

  assert.deepEqual(
    calls.map((options) => [options.method, options.path]),
    [
      ["POST", "/auth/challenge"],
      ["POST", "/auth/ksef-token"],
      ["GET", "/auth/REF%2F1"],
      ["POST", "/auth/token/redeem"],
      ["POST", "/auth/token/refresh"],
    ],
  );
  assert.deepEqual(calls[1].body, authRequest);
  assert.equal(calls[2].authToken, "auth-token");
  assert.equal(calls[3].authToken, "auth-token");
  assert.equal(calls[4].authToken, "refresh-token");
});
