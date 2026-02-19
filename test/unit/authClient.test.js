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
