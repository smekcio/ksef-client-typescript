import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { KsefApiError, KsefClient } from "../../dist/index.js";

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

test("HttpClient retries GET on 5xx and succeeds", async () => {
  let attempts = 0;
  const server = createServer((req, res) => {
    if (req.url !== "/v2/security/public-key-certificates") {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Not found" }));
      return;
    }

    attempts += 1;
    if (attempts < 3) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: 500 }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify([]));
  });
  const address = await listen(server);
  const client = new KsefClient({
    baseUrl: `http://127.0.0.1:${address.port}`,
    maxRetryAttempts: 3,
    maxRetryDelayMs: 1,
  });

  try {
    const result = await client.security.getPublicKeyCertificates();
    assert.deepEqual(result, []);
    assert.equal(attempts, 3);
  } finally {
    await closeServer(server);
  }
});

test("HttpClient retries timeout errors for idempotent GET", async () => {
  let attempts = 0;
  const firstAttemptResponseDelayMs = 600;
  const server = createServer((req, res) => {
    if (req.url !== "/v2/security/public-key-certificates") {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Not found" }));
      return;
    }

    attempts += 1;
    if (attempts === 1) {
      setTimeout(() => {
        if (res.writableEnded || res.destroyed) {
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify([]));
      }, firstAttemptResponseDelayMs);
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify([]));
  });
  const address = await listen(server);
  const client = new KsefClient({
    baseUrl: `http://127.0.0.1:${address.port}`,
    timeoutMs: 200,
    maxRetryAttempts: 3,
    maxRetryDelayMs: 1,
  });

  try {
    const result = await client.security.getPublicKeyCertificates();
    assert.deepEqual(result, []);
    assert.ok(attempts >= 2);
  } finally {
    await closeServer(server);
  }
});

test("HttpClient appendV2=false keeps base URL as-is", async () => {
  const requests = [];
  const server = createServer((req, res) => {
    requests.push(req.url);
    if (req.url === "/security/public-key-certificates") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify([]));
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "Not found" }));
  });
  const address = await listen(server);
  const client = new KsefClient({
    baseUrl: `http://127.0.0.1:${address.port}`,
    appendV2: false,
  });

  try {
    await client.security.getPublicKeyCertificates();
    assert.deepEqual(requests, ["/security/public-key-certificates"]);
  } finally {
    await closeServer(server);
  }
});

test("HttpClient validates skipAuth presigned URL policy", async () => {
  const client = new KsefClient({ baseUrl: "https://api-test.ksef.mf.gov.pl/v2" });
  const http = client.http;

  await assert.rejects(
    () =>
      http.request({
        method: "GET",
        path: "http://files.example.com/export-part.bin",
        skipAuth: true,
      }),
    /https is required/,
  );

  await assert.rejects(
    () =>
      http.request({
        method: "GET",
        path: "https://localhost/export-part.bin",
        skipAuth: true,
      }),
    /localhost hosts are not allowed/,
  );

  const allowlistedClient = new KsefClient({
    baseUrl: "https://api-test.ksef.mf.gov.pl/v2",
    allowedPresignedHosts: ["uploads.example.com"],
  });
  const allowlistedHttp = allowlistedClient.http;
  await assert.rejects(
    () =>
      allowlistedHttp.request({
        method: "GET",
        path: "https://other.example.com/export-part.bin",
        skipAuth: true,
      }),
    /allowedPresignedHosts/,
  );
});

test("HttpClient rejects skipAuth combined with authToken", async () => {
  const client = new KsefClient({ baseUrl: "https://api-test.ksef.mf.gov.pl/v2" });
  const http = client.http;

  await assert.rejects(
    () =>
      http.request({
        method: "GET",
        path: "https://uploads.example.com/export-part.bin",
        skipAuth: true,
        authToken: "token",
      }),
    /cannot be used together/,
  );
});

test("HttpClient parses application/problem+json errors as KsefApiError", async () => {
  const server = createServer((_, res) => {
    res.writeHead(403, { "Content-Type": "application/problem+json" });
    res.end(
      JSON.stringify({
        title: "Forbidden",
        status: 403,
        detail: "Missing permissions",
        reasonCode: "missing-permissions",
      }),
    );
  });
  const address = await listen(server);
  const client = new KsefClient({
    baseUrl: `http://127.0.0.1:${address.port}`,
    retryOn429: false,
    retryOn5xx: false,
  });

  try {
    await assert.rejects(
      () =>
        client.http.request({
          method: "GET",
          path: "/problem",
        }),
      (error) => {
        assert.ok(error instanceof KsefApiError);
        assert.equal(error.statusCode, 403);
        assert.deepEqual(error.responseBody, {
          title: "Forbidden",
          status: 403,
          detail: "Missing permissions",
          reasonCode: "missing-permissions",
        });
        return true;
      },
    );
  } finally {
    await closeServer(server);
  }
});

test("HttpClient parses application/*+json success responses as JSON", async () => {
  const server = createServer((_, res) => {
    res.writeHead(200, { "Content-Type": "application/vnd.ksef+json" });
    res.end(JSON.stringify({ ok: true, source: "plus-json" }));
  });
  const address = await listen(server);
  const client = new KsefClient({
    baseUrl: `http://127.0.0.1:${address.port}`,
    retryOn429: false,
    retryOn5xx: false,
  });

  try {
    const payload = await client.http.request({
      method: "GET",
      path: "/plus-json",
    });
    assert.deepEqual(payload, { ok: true, source: "plus-json" });
  } finally {
    await closeServer(server);
  }
});
