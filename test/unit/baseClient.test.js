import assert from "node:assert/strict";
import { test } from "node:test";
import { KsefSessionExpiredError, LimitsClient } from "../../dist/index.js";

test("BaseClient throws when access token provider is missing", async () => {
  const http = {
    request: async () => ({}),
  };
  const client = new LimitsClient(http);

  await assert.rejects(
    () => client.getContextLimits(),
    (error) => {
      assert.ok(error instanceof KsefSessionExpiredError);
      assert.equal(error.message, "Access token provider is missing.");
      return true;
    },
  );
});

test("BaseClient throws when access token provider returns empty token", async () => {
  const http = {
    request: async () => ({}),
  };
  const client = new LimitsClient(http, async () => null);

  await assert.rejects(
    () => client.getContextLimits(),
    (error) => {
      assert.ok(error instanceof KsefSessionExpiredError);
      assert.equal(error.message, "Access token is missing.");
      return true;
    },
  );
});
