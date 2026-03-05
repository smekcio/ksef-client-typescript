import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { KsefClient, LighthouseClient } from "../../dist/index.js";

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

test("LighthouseClient targets absolute lighthouse endpoints", async () => {
  const captured = [];
  const http = {
    request: async (options) => {
      captured.push(options);
      if (options.path.endsWith("/status")) {
        return { status: "AVAILABLE" };
      }
      return [];
    },
  };
  const client = new LighthouseClient(http, "https://api-latarnia-test.ksef.mf.gov.pl/");

  const status = await client.getStatus();
  const messages = await client.getMessages();

  assert.equal(status.status, "AVAILABLE");
  assert.deepEqual(messages, []);
  assert.equal(captured[0].method, "GET");
  assert.equal(captured[0].path, "https://api-latarnia-test.ksef.mf.gov.pl/status");
  assert.equal(captured[1].path, "https://api-latarnia-test.ksef.mf.gov.pl/messages");
});

test("KsefClient exposes lighthouse client with baseLighthouseUrl", async () => {
  const requests = [];
  const server = createServer((req, res) => {
    requests.push(req.url);
    if (req.url === "/status") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "AVAILABLE" }));
      return;
    }
    if (req.url === "/messages") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify([]));
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "Not found" }));
  });

  await new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Server address is not available.");
  }
  const { port } = address;
  const baseUrl = `http://127.0.0.1:${port}`;
  const client = new KsefClient({
    baseUrl: `${baseUrl}/v2`,
    baseLighthouseUrl: baseUrl,
  });

  try {
    const status = await client.lighthouse.getStatus();
    const messages = await client.lighthouse.getMessages();

    assert.equal(status.status, "AVAILABLE");
    assert.deepEqual(messages, []);
    assert.deepEqual(requests, ["/status", "/messages"]);
  } finally {
    await closeServer(server);
  }
});

test("LighthouseClient throws when base URL is empty after normalization", async () => {
  const client = new LighthouseClient(
    {
      request: async () => {
        throw new Error("should not call request");
      },
    },
    "///",
  );

  await assert.rejects(
    () => client.getStatus(),
    /Lighthouse base URL is missing/,
  );
});
