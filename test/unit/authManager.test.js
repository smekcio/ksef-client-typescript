import assert from "node:assert/strict";
import { test } from "node:test";
import { KsefClient, KsefSessionExpiredError } from "../../dist/index.js";

test("AuthManager returns null when no access token is set", async () => {
  const client = new KsefClient({ baseUrl: "https://api-test.ksef.mf.gov.pl/v2" });

  assert.equal(await client.authManager.getAccessToken(), null);
});

test("AuthManager returns current access token when it is not near expiry", async () => {
  const client = new KsefClient({ baseUrl: "https://api-test.ksef.mf.gov.pl/v2" });
  client.authManager.setAccessToken("plain-access-token", "2999-01-01T00:00:00Z");

  assert.equal(await client.authManager.getAccessToken(), "plain-access-token");
});

test("AuthManager throws when token is expired and refresh token is missing", async () => {
  const client = new KsefClient({ baseUrl: "https://api-test.ksef.mf.gov.pl/v2" });
  client.authManager.setAccessToken("expired-access-token", "2000-01-01T00:00:00Z");

  await assert.rejects(
    () => client.authManager.getAccessToken(),
    (error) => {
      assert.ok(error instanceof KsefSessionExpiredError);
      assert.equal(error.message, "Refresh token is missing.");
      return true;
    },
  );
});

test("AuthManager clears tokens and throws session-expired error when refresh fails", async () => {
  const client = new KsefClient({ baseUrl: "https://api-test.ksef.mf.gov.pl/v2" });
  client.authManager.setTokens({
    accessToken: {
      token: "expired-access-token",
      validUntil: "2000-01-01T00:00:00Z",
    },
    refreshToken: {
      token: "refresh-token",
      validUntil: "2999-01-01T00:00:00Z",
    },
  });
  client.auth.refreshAccessToken = async () => {
    throw new Error("refresh failed");
  };

  await assert.rejects(
    () => client.authManager.getAccessToken(),
    (error) => {
      assert.ok(error instanceof KsefSessionExpiredError);
      assert.equal(error.message, "Failed to refresh access token.");
      return true;
    },
  );
  assert.equal(await client.authManager.getAccessToken(), null);
});

test("AuthManager reuses in-flight refresh request for concurrent callers", async () => {
  const client = new KsefClient({ baseUrl: "https://api-test.ksef.mf.gov.pl/v2" });
  client.authManager.setTokens({
    accessToken: {
      token: "expired-access-token",
      validUntil: "2000-01-01T00:00:00Z",
    },
    refreshToken: {
      token: "refresh-token",
      validUntil: "2999-01-01T00:00:00Z",
    },
  });

  let calls = 0;
  let releaseRefresh;
  const refreshGate = new Promise((resolve) => {
    releaseRefresh = resolve;
  });
  client.auth.refreshAccessToken = async () => {
    calls += 1;
    await refreshGate;
    return {
      accessToken: {
        token: "refreshed-access-token",
        validUntil: "2999-01-01T00:00:00Z",
      },
    };
  };

  const first = client.authManager.getAccessToken();
  const second = client.authManager.getAccessToken();
  releaseRefresh();
  const [tokenA, tokenB] = await Promise.all([first, second]);

  assert.equal(tokenA, "refreshed-access-token");
  assert.equal(tokenB, "refreshed-access-token");
  assert.equal(calls, 1);
});
