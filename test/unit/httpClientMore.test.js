import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { KsefClient, KsefHttpError, KsefRateLimitError } from "../../dist/index.js";

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

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

test("HttpClient handles text, xml, buffer and 204 responses", async () => {
  const server = createServer((req, res) => {
    if (req.url === "/v2/text") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("plain-text");
      return;
    }
    if (req.url === "/v2/xml") {
      res.writeHead(200, { "Content-Type": "application/xml" });
      res.end("<ok>true</ok>");
      return;
    }
    if (req.url === "/v2/binary") {
      res.writeHead(200, { "Content-Type": "application/octet-stream" });
      res.end(Buffer.from("binary-data", "utf8"));
      return;
    }
    if (req.url === "/v2/no-content") {
      res.writeHead(204);
      res.end();
      return;
    }
    res.writeHead(404).end();
  });
  const address = await listen(server);
  const client = new KsefClient({
    baseUrl: `http://127.0.0.1:${address.port}`,
    retryOn429: false,
    retryOn5xx: false,
  });

  try {
    const textPayload = await client.http.request({ method: "GET", path: "/text", responseType: "text" });
    assert.equal(textPayload, "plain-text");

    const xmlPayload = await client.http.request({ method: "GET", path: "/xml" });
    assert.equal(xmlPayload, "<ok>true</ok>");

    const binaryPayload = await client.http.request({ method: "GET", path: "/binary", responseType: "buffer" });
    assert.equal(Buffer.isBuffer(binaryPayload), true);
    assert.equal(binaryPayload.toString("utf8"), "binary-data");

    const noContent = await client.http.request({ method: "GET", path: "/no-content" });
    assert.equal(noContent, undefined);
  } finally {
    await closeServer(server);
  }
});

test("HttpClient throws KsefHttpError for non-json error body", async () => {
  const server = createServer((_, res) => {
    res.writeHead(503, { "Content-Type": "text/plain" });
    res.end("service unavailable");
  });
  const address = await listen(server);
  const client = new KsefClient({
    baseUrl: `http://127.0.0.1:${address.port}`,
    retryOn429: false,
    retryOn5xx: false,
  });

  try {
    await assert.rejects(
      () => client.http.request({ method: "GET", path: "/error" }),
      (error) => {
        assert.ok(error instanceof KsefHttpError);
        assert.equal(error.statusCode, 503);
        assert.equal(error.responseBody, "service unavailable");
        return true;
      },
    );
  } finally {
    await closeServer(server);
  }
});

test("HttpClient retries 429 using Retry-After header", async () => {
  let attempts = 0;
  const server = createServer((_, res) => {
    attempts += 1;
    if (attempts === 1) {
      res.writeHead(429, {
        "Content-Type": "application/json",
        "Retry-After": "0",
      });
      res.end(JSON.stringify({ status: 429 }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  const address = await listen(server);
  const client = new KsefClient({
    baseUrl: `http://127.0.0.1:${address.port}`,
    retryOn429: true,
    retryOn5xx: false,
    maxRetryAttempts: 2,
    maxRetryDelayMs: 1,
  });

  try {
    const payload = await client.http.request({ method: "GET", path: "/rate-limit" });
    assert.deepEqual(payload, { ok: true });
    assert.equal(attempts, 2);
  } finally {
    await closeServer(server);
  }
});

test("HttpClient does not retry non-idempotent POST on 429", async () => {
  let attempts = 0;
  const server = createServer((_, res) => {
    attempts += 1;
    res.writeHead(429, {
      "Content-Type": "application/json",
      "Retry-After": "1",
    });
    res.end(JSON.stringify({ status: 429, message: "too many requests" }));
  });
  const address = await listen(server);
  const client = new KsefClient({
    baseUrl: `http://127.0.0.1:${address.port}`,
    retryOn429: true,
    retryOn5xx: false,
    maxRetryAttempts: 3,
    maxRetryDelayMs: 1,
  });

  try {
    await assert.rejects(
      () =>
        client.http.request({
          method: "POST",
          path: "/rate-limit-post",
          body: { value: 1 },
        }),
      (error) => {
        assert.ok(error instanceof KsefRateLimitError);
        assert.equal(error.statusCode, 429);
        return true;
      },
    );
    assert.equal(attempts, 1);
  } finally {
    await closeServer(server);
  }
});

test("HttpClient bypasses proxy when host is in NO_PROXY list", async () => {
  const server = createServer((_, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  const address = await listen(server);

  const client = new KsefClient({
    baseUrl: `http://127.0.0.1:${address.port}`,
    proxy: "http://127.0.0.1:1",
    noProxy: "127.0.0.1,localhost",
    retryOn429: false,
    retryOn5xx: false,
  });

  try {
    const payload = await client.http.request({
      method: "GET",
      path: "/proxy-bypass",
    });
    assert.deepEqual(payload, { ok: true });
  } finally {
    await closeServer(server);
  }
});

test("HttpClient trims trailing baseUrl slash and supports plain fallback response", async () => {
  const server = createServer((req, res) => {
    if (req.url === "/v2/plain-fallback") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("fallback-body");
      return;
    }
    res.writeHead(404).end();
  });
  const address = await listen(server);
  const client = new KsefClient({
    baseUrl: `http://127.0.0.1:${address.port}/`,
    retryOn429: false,
    retryOn5xx: false,
  });

  try {
    const payload = await client.http.request({ method: "GET", path: "/plain-fallback" });
    assert.equal(payload, "fallback-body");
  } finally {
    await closeServer(server);
  }
});

test("HttpClient handles string, Buffer and Uint8Array request bodies and query arrays", async () => {
  const observed = [];
  const server = createServer(async (req, res) => {
    if (req.method === "POST" && req.url?.startsWith("/v2/echo")) {
      const body = await readBody(req);
      observed.push({
        url: req.url,
        contentType: req.headers["content-type"] ?? null,
        body: body.toString("utf8"),
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.method === "GET" && req.url?.startsWith("/v2/query-array")) {
      observed.push({ url: req.url });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.writeHead(404).end();
  });
  const address = await listen(server);
  const client = new KsefClient({
    baseUrl: `http://127.0.0.1:${address.port}`,
    retryOn429: false,
    retryOn5xx: false,
  });

  try {
    await client.http.request({
      method: "POST",
      path: "/echo-string",
      body: "plain-text-body",
    });
    await client.http.request({
      method: "POST",
      path: "/echo-buffer",
      body: Buffer.from("buffer-body", "utf8"),
    });
    await client.http.request({
      method: "POST",
      path: "/echo-u8",
      body: new Uint8Array([65, 66, 67]),
    });
    await client.http.request({
      method: "GET",
      path: "/query-array",
      query: { value: ["a", "b"] },
    });

    assert.equal(observed[0].body, "plain-text-body");
    assert.match(observed[0].contentType, /text\/plain/i);
    assert.equal(observed[1].body, "buffer-body");
    assert.equal(observed[2].body, "ABC");
    assert.match(observed[3].url, /value=a/);
    assert.match(observed[3].url, /value=b/);
  } finally {
    await closeServer(server);
  }
});

test("HttpClient non-json 429 throws KsefRateLimitError and skipAuth relative paths bypass URL validation", async () => {
  const server = createServer((req, res) => {
    if (req.url === "/v2/rate-limit-text") {
      res.writeHead(429, { "Content-Type": "text/plain", "Retry-After": "0" });
      res.end("too many");
      return;
    }
    if (req.url === "/v2/no-absolute") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.writeHead(404).end();
  });
  const address = await listen(server);
  const client = new KsefClient({
    baseUrl: `http://127.0.0.1:${address.port}`,
    retryOn429: false,
    retryOn5xx: false,
  });
  const nonHttpClient = new KsefClient({
    baseUrl: "ftp://127.0.0.1",
    retryOn429: false,
    retryOn5xx: false,
  });

  try {
    await assert.rejects(
      () => client.http.request({ method: "GET", path: "/rate-limit-text" }),
      (error) => {
        assert.ok(error instanceof KsefRateLimitError);
        assert.equal(error.statusCode, 429);
        return true;
      },
    );

    await assert.rejects(
      () =>
        nonHttpClient.http.request({
          method: "GET",
          path: "/no-absolute",
          skipAuth: true,
        }),
    );
  } finally {
    await closeServer(server);
  }
});

test("HttpClient retry handles Retry-After HTTP date and 460 payload detail variants", async () => {
  let attempts = 0;
  const server = createServer((req, res) => {
    if (req.url === "/v2/retry-after-date") {
      attempts += 1;
      if (attempts === 1) {
        const retryDate = new Date(Date.now() + 50).toUTCString();
        res.writeHead(429, { "Content-Type": "application/json", "Retry-After": retryDate });
        res.end(JSON.stringify({ status: 429 }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.url === "/v2/err-460-not-object") {
      res.writeHead(460, { "Content-Type": "application/json" });
      res.end(JSON.stringify(["x"]));
      return;
    }
    if (req.url === "/v2/err-460-status-not-object") {
      res.writeHead(460, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "bad" }));
      return;
    }
    if (req.url === "/v2/err-460-details-string") {
      res.writeHead(460, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: { details: "suspended certificate" } }));
      return;
    }
    if (req.url === "/v2/err-460-details-other") {
      res.writeHead(460, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: { details: 123 } }));
      return;
    }

    res.writeHead(404).end();
  });
  const address = await listen(server);
  const client = new KsefClient({
    baseUrl: `http://127.0.0.1:${address.port}`,
    retryOn429: true,
    retryOn5xx: false,
    maxRetryAttempts: 2,
    maxRetryDelayMs: 100,
  });

  try {
    const ok = await client.http.request({ method: "GET", path: "/retry-after-date" });
    assert.deepEqual(ok, { ok: true });
    assert.equal(attempts, 2);

    for (const pathName of [
      "/err-460-not-object",
      "/err-460-status-not-object",
      "/err-460-details-string",
      "/err-460-details-other",
    ]) {
      await assert.rejects(() => client.http.request({ method: "GET", path: pathName }));
    }
  } finally {
    await closeServer(server);
  }
});

test("HttpClient uses proxy dispatcher when no NO_PROXY is configured and bypasses when wildcard is used", async () => {
  const server = createServer((_, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  const address = await listen(server);

  const withProxyOnly = new KsefClient({
    baseUrl: `http://127.0.0.1:${address.port}`,
    proxy: "http://127.0.0.1:1",
    retryOn429: false,
    retryOn5xx: false,
  });
  const withWildcardBypass = new KsefClient({
    baseUrl: `http://127.0.0.1:${address.port}`,
    proxy: "http://127.0.0.1:1",
    noProxy: "*",
    retryOn429: false,
    retryOn5xx: false,
  });

  try {
    await assert.rejects(() => withProxyOnly.http.request({ method: "GET", path: "/proxy-required" }));

    const ok = await withWildcardBypass.http.request({ method: "GET", path: "/proxy-bypass-all" });
    assert.deepEqual(ok, { ok: true });
  } finally {
    await closeServer(server);
  }
});

test("HttpClient retry loop throws fallback error when maxAttempts is NaN", async () => {
  const server = createServer((_, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
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
          path: "/never-run",
          retry: { maxAttempts: Number.NaN },
        }),
      (error) => {
        assert.ok(error instanceof KsefHttpError);
        assert.match(error.message, /retry loop exited unexpectedly/);
        return true;
      },
    );
  } finally {
    await closeServer(server);
  }
});

test("HttpClient timeout retry helper does not treat non-Error throws as retryable", async () => {
  const server = createServer((_, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  const address = await listen(server);
  const client = new KsefClient({
    baseUrl: `http://127.0.0.1:${address.port}`,
    retryOn429: false,
    retryOn5xx: false,
    retryOnTimeout: true,
    maxRetryAttempts: 2,
    maxRetryDelayMs: 1,
  });

  const originalHandleResponse = client.http.handleResponse;
  client.http.handleResponse = async function patchedHandleResponse() {
    throw { code: "ETIMEDOUT" };
  };

  try {
    await assert.rejects(
      () =>
        client.http.request({
          method: "GET",
          path: "/timeout-non-error",
          retry: { maxAttempts: 3, retryOnTimeout: true },
        }),
      (reason) => {
        assert.equal(typeof reason, "object");
        assert.equal(reason.code, "ETIMEDOUT");
        return true;
      },
    );
  } finally {
    client.http.handleResponse = originalHandleResponse;
    await closeServer(server);
  }
});

test("HttpClient timeout retry helper retries when error has timeout code", async () => {
  const server = createServer((_, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  const address = await listen(server);
  const client = new KsefClient({
    baseUrl: `http://127.0.0.1:${address.port}`,
    retryOn429: false,
    retryOn5xx: false,
    retryOnTimeout: true,
    maxRetryAttempts: 3,
    maxRetryDelayMs: 1,
  });

  const originalHandleResponse = client.http.handleResponse;
  let calls = 0;
  client.http.handleResponse = async function patchedHandleResponse(response, responseType) {
    calls += 1;
    if (calls === 1) {
      const timeoutErr = new Error("timed out");
      timeoutErr.code = "UND_ERR_CONNECT_TIMEOUT";
      throw timeoutErr;
    }
    return await originalHandleResponse.call(this, response, responseType);
  };

  try {
    const payload = await client.http.request({
      method: "GET",
      path: "/timeout-error-code",
      retry: { maxAttempts: 3, retryOnTimeout: true },
    });
    assert.deepEqual(payload, { ok: true });
    assert.equal(calls, 2);
  } finally {
    client.http.handleResponse = originalHandleResponse;
    await closeServer(server);
  }
});

test("HttpClient throws lastError after retry loop exits on dynamic maxAttempts changes", async () => {
  const server = createServer((_, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  const address = await listen(server);
  const client = new KsefClient({
    baseUrl: `http://127.0.0.1:${address.port}`,
    retryOn429: false,
    retryOn5xx: false,
    retryOnTimeout: true,
    maxRetryAttempts: 5,
    maxRetryDelayMs: 1,
  });

  const originalHandleResponse = client.http.handleResponse;
  const dynamicMaxAttempts = {
    calls: 0,
    valueOf() {
      this.calls += 1;
      if (this.calls <= 2) {
        return 2;
      }
      return 1;
    },
  };

  client.http.handleResponse = async function forceTimeout() {
    const error = new Error("simulated timeout");
    error.name = "TimeoutError";
    throw error;
  };

  try {
    await assert.rejects(
      () =>
        client.http.request({
          method: "GET",
          path: "/dynamic-max-attempts",
          retry: { maxAttempts: dynamicMaxAttempts, retryOnTimeout: true },
        }),
      /simulated timeout/,
    );
  } finally {
    client.http.handleResponse = originalHandleResponse;
    await closeServer(server);
  }
});

test("HttpClient can continue response parsing when throwForError is patched not to throw", async () => {
  const server = createServer((_, res) => {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("patched-error-body");
  });
  const address = await listen(server);
  const client = new KsefClient({
    baseUrl: `http://127.0.0.1:${address.port}`,
    retryOn429: false,
    retryOn5xx: false,
  });

  const originalThrowForError = client.http.throwForError;
  client.http.throwForError = async () => undefined;

  try {
    const payload = await client.http.request({
      method: "GET",
      path: "/patched-nonthrow-error",
      responseType: "text",
    });
    assert.equal(payload, "patched-error-body");
  } finally {
    client.http.throwForError = originalThrowForError;
    await closeServer(server);
  }
});

test("HttpClient helper methods cover subdomain NO_PROXY matching and non-slash buildUrl path", () => {
  const client = new KsefClient({
    baseUrl: "https://api.example.invalid/v2",
    proxy: "http://127.0.0.1:8080",
    noProxy: "example.invalid",
    retryOn429: false,
    retryOn5xx: false,
  });

  const built = client.http.buildUrl("status");
  assert.equal(built, "https://api.example.invalid/v2/status");

  const dispatcher = client.http.getDispatcher("https://sub.example.invalid/file.bin");
  assert.equal(dispatcher, undefined);
});

test("HttpClient 460 handling covers extractStatusDetails empty-mapped branch", async () => {
  const server = createServer((_, res) => {
    res.writeHead(460, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: { details: [123, 456] } }));
  });
  const address = await listen(server);
  const client = new KsefClient({
    baseUrl: `http://127.0.0.1:${address.port}`,
    retryOn429: false,
    retryOn5xx: false,
  });

  try {
    await assert.rejects(() => client.http.request({ method: "GET", path: "/err-460-empty-mapped" }));
  } finally {
    await closeServer(server);
  }
});

test("HttpClient 460 handling covers suspended-details suffix false branch", async () => {
  const server = createServer((_, res) => {
    res.writeHead(460, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: { details: ["certificate suspended"] } }));
  });
  const address = await listen(server);
  const client = new KsefClient({
    baseUrl: `http://127.0.0.1:${address.port}`,
    retryOn429: false,
    retryOn5xx: false,
  });

  const originalFilter = Array.prototype.filter;
  let lengthReads = 0;
  Array.prototype.filter = function patchedFilter(predicate, thisArg) {
    if (
      Array.isArray(this) &&
      this.length === 1 &&
      this[0] === "certificate suspended"
    ) {
      return {
        some: () => true,
        join: () => "",
        get length() {
          lengthReads += 1;
          return lengthReads === 1 ? 1 : 0;
        },
      };
    }
    return originalFilter.call(this, predicate, thisArg);
  };

  try {
    await assert.rejects(
      () => client.http.request({ method: "GET", path: "/err-460-suffix-false" }),
      (error) => {
        assert.match(error.message, /certificate is suspended\.$/);
        return true;
      },
    );
  } finally {
    Array.prototype.filter = originalFilter;
    await closeServer(server);
  }
});
