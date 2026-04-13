import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { KsefApiError, KsefClient, KsefRateLimitError } from "../../dist/index.js";

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
        assert.deepEqual(error.problem, {
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

test("HttpClient maps 400, 401, 410 and 429 problem details to error.problem", async () => {
  const responses = {
    "/v2/problem-400": {
      status: 400,
      body: {
        title: "Bad Request",
        status: 400,
        detail: "Validation failed",
        timestamp: "2026-04-13T20:15:00Z",
        traceId: "trace-400",
        instance: "/problem-400",
        errors: [{ code: 12001, description: "Invalid field", details: ["field:a"] }],
      },
    },
    "/v2/problem-401": {
      status: 401,
      body: {
        title: "Unauthorized",
        status: 401,
        detail: "Missing bearer token",
        timestamp: "2026-04-13T20:16:00Z",
        traceId: "trace-401",
      },
    },
    "/v2/problem-410": {
      status: 410,
      body: {
        title: "Gone",
        status: 410,
        detail: "Authentication status has expired",
        timestamp: "2026-04-13T20:17:00Z",
        traceId: "trace-410",
        instance: "/problem-410",
      },
    },
    "/v2/problem-429": {
      status: 429,
      headers: {
        "Retry-After": "Wed, 01 Jan 2099 00:00:00 GMT",
      },
      body: {
        title: "Too Many Requests",
        status: 429,
        detail: "Retry later",
        timestamp: "2026-04-13T20:18:00Z",
        traceId: "trace-429",
        instance: "/problem-429",
      },
    },
  };

  const server = createServer((req, res) => {
    const entry = responses[req.url];
    if (!entry) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Not found" }));
      return;
    }

    res.writeHead(entry.status, {
      "Content-Type": "application/problem+json",
      ...(entry.headers ?? {}),
    });
    res.end(JSON.stringify(entry.body));
  });
  const address = await listen(server);
  const client = new KsefClient({
    baseUrl: `http://127.0.0.1:${address.port}`,
    retryOn429: false,
    retryOn5xx: false,
  });

  try {
    await assert.rejects(
      () => client.http.request({ method: "GET", path: "/problem-400" }),
      (error) => {
        assert.ok(error instanceof KsefApiError);
        assert.equal(error.problem.timestamp, "2026-04-13T20:15:00Z");
        assert.equal(error.problem.errors[0].code, 12001);
        return true;
      },
    );

    await assert.rejects(
      () => client.http.request({ method: "GET", path: "/problem-401" }),
      (error) => {
        assert.ok(error instanceof KsefApiError);
        assert.equal(error.problem.timestamp, "2026-04-13T20:16:00Z");
        assert.equal(error.problem.title, "Unauthorized");
        return true;
      },
    );

    await assert.rejects(
      () => client.http.request({ method: "GET", path: "/problem-410" }),
      (error) => {
        assert.ok(error instanceof KsefApiError);
        assert.equal(error.problem.timestamp, "2026-04-13T20:17:00Z");
        assert.equal(error.problem.title, "Gone");
        return true;
      },
    );

    await assert.rejects(
      () => client.http.request({ method: "GET", path: "/problem-429" }),
      (error) => {
        assert.ok(error instanceof KsefRateLimitError);
        assert.equal(error.problem.timestamp, "2026-04-13T20:18:00Z");
        assert.equal(error.retryAfter, "Wed, 01 Jan 2099 00:00:00 GMT");
        assert.ok((error.retryAfterSeconds ?? 0) > 0);
        return true;
      },
    );
  } finally {
    await closeServer(server);
  }
});

test("HttpClient falls back to UnknownApiProblem for unknown json payloads", async () => {
  const server = createServer((_, res) => {
    res.writeHead(418, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "teapot", nested: { a: 1 } }));
  });
  const address = await listen(server);
  const client = new KsefClient({
    baseUrl: `http://127.0.0.1:${address.port}`,
    retryOn429: false,
    retryOn5xx: false,
  });

  try {
    await assert.rejects(
      () => client.http.request({ method: "GET", path: "/unknown-json" }),
      (error) => {
        assert.ok(error instanceof KsefApiError);
        assert.equal(error.problem.status, 418);
        assert.equal(error.problem.title, "API error");
        assert.deepEqual(error.problem.raw, { error: "teapot", nested: { a: 1 } });
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
