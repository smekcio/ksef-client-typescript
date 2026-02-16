import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import {
  KsefApiError,
  KsefAuthStatusError,
  KsefClient,
} from "../../dist/index.js";

function startServer(responseBody) {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      if (req.method === "POST" && req.url === "/v2/auth/challenge") {
        res.writeHead(460, { "Content-Type": "application/json" });
        res.end(JSON.stringify(responseBody));
        return;
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Not found" }));
    });

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${address.port}`,
      });
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

test("HTTP 460 with suspended certificate details throws KsefAuthStatusError", async () => {
  const { server, baseUrl } = await startServer({
    status: {
      details: ["Certyfikat zawieszony"],
    },
  });

  try {
    const client = new KsefClient({ baseUrl });
    await assert.rejects(
      () => client.auth.getChallenge(),
      (error) => {
        assert.ok(error instanceof KsefAuthStatusError);
        assert.equal(error.statusCode, 460);
        return true;
      },
    );
  } finally {
    await closeServer(server);
  }
});

test("HTTP 460 with other details stays KsefApiError", async () => {
  const { server, baseUrl } = await startServer({
    status: {
      details: ["Inny blad autoryzacji"],
    },
  });

  try {
    const client = new KsefClient({ baseUrl });
    await assert.rejects(
      () => client.auth.getChallenge(),
      (error) => {
        assert.ok(error instanceof KsefApiError);
        assert.ok(!(error instanceof KsefAuthStatusError));
        assert.equal(error.statusCode, 460);
        return true;
      },
    );
  } finally {
    await closeServer(server);
  }
});
