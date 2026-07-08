import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import {
  AuthCoordinator,
  KsefClient,
  KSEF_ENV_URLS,
  KSEF_LIGHTHOUSE_URLS,
  KSEF_LIGHTHOUSE_ENV_BY_KSEF_ENV,
  KSEF_QR_URLS,
} from "../../dist/index.js";

function listen(server) {
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Server address is not available."));
        return;
      }
      resolve(address);
    });
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

test("KsefClient constructor requires baseUrl or environment", () => {
  assert.throws(() => new KsefClient({}), /baseUrl or environment is required/);
});

test("KsefClient.connect forwards options to auth workflow and stores tokens", async () => {
  const originalAuthenticate = AuthCoordinator.prototype.authenticateWithKsefToken;
  let receivedOptions = null;
  AuthCoordinator.prototype.authenticateWithKsefToken = async function authenticateWithKsefToken(
    options,
  ) {
    receivedOptions = options;
    return {
      accessToken: { token: "ACCESS-TOKEN", validUntil: "2099-01-01T00:00:00Z" },
      refreshToken: { token: "REFRESH-TOKEN", validUntil: "2099-01-01T00:00:00Z" },
    };
  };

  try {
    const client = await KsefClient.connect({
      baseUrl: "https://api-test.ksef.mf.gov.pl/v2",
      token: "KSEF-TOKEN",
      context: { type: "Nip", value: "1111111111" },
      authorizationPolicy: { allowedIps: { ip4Addresses: ["127.0.0.1"] } },
      maxAttempts: 5,
      pollIntervalMs: 1,
      publicCertificateBase64Der: "CERT",
      requireExportPartHash: false,
    });

    const token = await client.authManager.getAccessToken();
    assert.equal(token, "ACCESS-TOKEN");
    assert.ok(receivedOptions);
    assert.equal(receivedOptions.token, "KSEF-TOKEN");
    assert.equal(receivedOptions.context.type, "Nip");
    assert.equal(receivedOptions.maxAttempts, 5);
    assert.equal(receivedOptions.pollIntervalMs, 1);
    assert.equal(receivedOptions.publicCertificateBase64Der, "CERT");
  } finally {
    AuthCoordinator.prototype.authenticateWithKsefToken = originalAuthenticate;
  }
});

test("KsefClient resolves lighthouse base URL from explicit and inferred options", async () => {
  const server = createServer((req, res) => {
    if (req.url === "/status") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "OK", version: "1" }));
      return;
    }
    res.writeHead(404).end();
  });
  const address = await listen(server);
  const localLighthouseUrl = `http://127.0.0.1:${address.port}`;

  const originalProd = KSEF_LIGHTHOUSE_URLS.PROD;
  const originalPrd = KSEF_LIGHTHOUSE_URLS.PRD;
  const originalTest = KSEF_LIGHTHOUSE_URLS.TEST;
  const originalEnvTest = KSEF_ENV_URLS.TEST;

  KSEF_LIGHTHOUSE_URLS.PROD = localLighthouseUrl;
  KSEF_LIGHTHOUSE_URLS.PRD = localLighthouseUrl;
  KSEF_LIGHTHOUSE_URLS.TEST = localLighthouseUrl;
  KSEF_ENV_URLS.TEST = "https://api-no-v2.example.test";

  try {
    const explicit = new KsefClient({
      baseUrl: "https://api-test.ksef.mf.gov.pl/v2",
      lighthouseEnvironment: "PROD",
    });
    const explicitStatus = await explicit.lighthouse.getStatus();
    assert.equal(explicitStatus.status, "OK");

    const inferred = new KsefClient({
      baseUrl: "https://api-no-v2.example.test/custom-path",
    });
    const inferredStatus = await inferred.lighthouse.getStatus();
    assert.equal(inferredStatus.status, "OK");
  } finally {
    KSEF_LIGHTHOUSE_URLS.PROD = originalProd;
    KSEF_LIGHTHOUSE_URLS.PRD = originalPrd;
    KSEF_LIGHTHOUSE_URLS.TEST = originalTest;
    KSEF_ENV_URLS.TEST = originalEnvTest;
    await closeServer(server);
  }
});

test("KsefClient forwards optional header and retryOnTimeout flags to HttpClient", () => {
  const client = new KsefClient({
    baseUrl: "https://api-test.ksef.mf.gov.pl/v2",
    headers: { "X-Test": "1" },
    retryOnTimeout: false,
  });

  assert.equal(client.http.defaultHeaders["X-Test"], "1");
  assert.equal(client.http.retryOnTimeout, false);
});

test("KsefClient derives base, QR and lighthouse URLs from environment", () => {
  const client = new KsefClient({ environment: "DEMO", requireExportPartHash: false });
  assert.equal(client.baseQrUrl, KSEF_QR_URLS.DEMO);
  assert.equal(
    client.lighthouse.baseUrl,
    KSEF_LIGHTHOUSE_URLS[KSEF_LIGHTHOUSE_ENV_BY_KSEF_ENV.DEMO],
  );
});

test("KsefClient honors explicit baseQrUrl override", () => {
  const client = new KsefClient({
    baseUrl: "https://api-test.ksef.mf.gov.pl/v2",
    baseQrUrl: "https://qr.example.test/custom",
  });
  assert.equal(client.baseQrUrl, "https://qr.example.test/custom");
});

test("KsefClient.connect works with minimal options", async () => {
  const originalAuthenticate = AuthCoordinator.prototype.authenticateWithKsefToken;
  let receivedOptions = null;
  AuthCoordinator.prototype.authenticateWithKsefToken = async function authenticateWithKsefToken(
    options,
  ) {
    receivedOptions = options;
    return {
      accessToken: { token: "MIN-ACCESS", validUntil: "2099-01-01T00:00:00Z" },
      refreshToken: { token: "MIN-REFRESH", validUntil: "2099-01-01T00:00:00Z" },
    };
  };

  try {
    const client = await KsefClient.connect({
      baseUrl: "https://api-test.ksef.mf.gov.pl/v2",
      token: "MIN-TOKEN",
      context: { type: "Nip", value: "1111111111" },
    });
    assert.equal(await client.authManager.getAccessToken(), "MIN-ACCESS");
    assert.ok(receivedOptions);
    assert.equal(receivedOptions.token, "MIN-TOKEN");
    assert.equal(receivedOptions.authorizationPolicy, undefined);
    assert.equal(receivedOptions.maxAttempts, undefined);
    assert.equal(receivedOptions.pollIntervalMs, undefined);
    assert.equal(receivedOptions.publicCertificateBase64Der, undefined);
  } finally {
    AuthCoordinator.prototype.authenticateWithKsefToken = originalAuthenticate;
  }
});
