import assert from "node:assert/strict";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { test } from "node:test";
import { runCli } from "../../dist/cli/index.js";

const VALID_IZ = "5265877635-IZ202508-0100001AF629-FC";
const VALID_IZ_2 = "5265877635-IZ202509-0100001AF629-19";
const VALID_KSEF = "5265877635-20250826-0100001AF629-AF";
const VALID_KSEF_2 = "5265877635-20250827-0100001AF629-4A";

function createCaptureIo() {
  const stdout = [];
  const stderr = [];
  return {
    io: {
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line),
    },
    stdout,
    stderr,
  };
}

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
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

test("CLI iz generate/query/invoices/by-ksef cover pagination and validation", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ksef-cli-iz-"));
  const captured = [];

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const body = req.method === "POST" ? JSON.parse((await readBody(req)) || "{}") : undefined;
    captured.push({
      method: req.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      body,
    });

    if (req.method === "POST" && url.pathname === "/v2/collective-identifiers") {
      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ collectiveIdentifierNumber: VALID_IZ }));
      return;
    }
    if (req.method === "POST" && url.pathname === "/v2/collective-identifiers/query") {
      const token = req.headers["x-continuation-token"];
      const omitToken = url.searchParams.get("pageSize") === "20";
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          collectiveIdentifiers: [
            {
              collectiveIdentifierNumber: token ? VALID_IZ_2 : VALID_IZ,
              dateCreated: "2026-01-02T00:00:00Z",
              createdInCurrentContext: true,
              invoiceCount: 2,
            },
          ],
          ...(omitToken ? {} : { continuationToken: token ? "" : "q2" }),
        }),
      );
      return;
    }
    if (req.method === "POST" && url.pathname === "/v2/collective-identifiers/invoices") {
      if (url.searchParams.get("pageSize") === "500") {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "forced invoices error" }));
        return;
      }
      const token = req.headers["x-continuation-token"];
      const omitToken = url.searchParams.get("pageSize") === "20";
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          invoices: [
            {
              collectiveIdentifierNumber: VALID_IZ,
              ksefNumber: token ? VALID_KSEF_2 : VALID_KSEF,
              detailsHidden: false,
            },
          ],
          ...(omitToken ? {} : { continuationToken: token ? null : "i2" }),
        }),
      );
      return;
    }
    if (req.method === "GET" && url.pathname === `/v2/collective-identifiers/ksef/${VALID_KSEF}`) {
      const token = req.headers["x-continuation-token"];
      const omitToken = url.searchParams.get("pageSize") === "20";
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          collectiveIdentifiers: [
            {
              collectiveIdentifierNumber: token ? VALID_IZ_2 : VALID_IZ,
              dateCreated: "2026-01-02T00:00:00Z",
              createdInCurrentContext: true,
            },
          ],
          ...(omitToken ? {} : { continuationToken: token ? "" : "b2" }),
        }),
      );
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: `${req.method} ${url.pathname} not mocked` }));
  });

  const address = await listen(server);
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const env = { KSEF_CLI_HOME: tempDir };

  try {
    let capture = createCaptureIo();
    let exitCode = await runCli(
      [
        "init",
        "--profile",
        "default",
        "--base-url",
        baseUrl,
        "--context-type",
        "Nip",
        "--context-value",
        "1111111111",
        "--token-store-policy",
        "plaintext",
      ],
      { io: capture.io, env, cwd: tempDir },
    );
    assert.equal(exitCode, 0, capture.stderr.join("\n"));

    const tokenPath = path.join(tempDir, "tokens.json");
    await writeFile(
      tokenPath,
      JSON.stringify({
        version: 1,
        profiles: {
          default: {
            accessToken: "access-token-1",
            accessTokenValidUntil: "2099-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z",
          },
        },
      }),
      "utf8",
    );

    const numbersFile = path.join(tempDir, "numbers.txt");
    await writeFile(numbersFile, `${VALID_KSEF}\n# comment\n${VALID_KSEF_2}\n`, "utf8");

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "iz"], { io: capture.io, env, cwd: tempDir });
    assert.equal(exitCode, 2);

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "iz", "weird"], { io: capture.io, env, cwd: tempDir });
    assert.equal(exitCode, 2);

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "iz", "generate"], { io: capture.io, env, cwd: tempDir });
    assert.equal(exitCode, 2);

    capture = createCaptureIo();
    exitCode = await runCli(
      ["--json", "iz", "generate", "--ksef-number", VALID_KSEF, "--from-file", numbersFile],
      { io: capture.io, env, cwd: tempDir },
    );
    assert.equal(exitCode, 2, capture.stderr.join("\n"));

    capture = createCaptureIo();
    exitCode = await runCli(
      ["--json", "iz", "generate", "--ksef-number", VALID_KSEF, "--ksef-number", VALID_KSEF_2],
      { io: capture.io, env, cwd: tempDir },
    );
    assert.equal(exitCode, 0, capture.stderr.join("\n"));
    assert.match(capture.stdout[0], new RegExp(VALID_IZ));

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "iz", "generate", "--from-file", numbersFile], {
      io: capture.io,
      env,
      cwd: tempDir,
    });
    assert.equal(exitCode, 0, capture.stderr.join("\n"));

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "iz", "query"], { io: capture.io, env, cwd: tempDir });
    assert.equal(exitCode, 2);

    capture = createCaptureIo();
    exitCode = await runCli(
      ["--json", "iz", "query", "--from", "2026-01-01", "--to", "2026-01-02", "--page-size", "5"],
      { io: capture.io, env, cwd: tempDir },
    );
    assert.equal(exitCode, 2);

    capture = createCaptureIo();
    exitCode = await runCli(
      [
        "--json",
        "iz",
        "query",
        "--from",
        "2026-01-01",
        "--to",
        "2026-01-02",
        "--iz",
        VALID_IZ,
        "--page-size",
        "10",
      ],
      { io: capture.io, env, cwd: tempDir },
    );
    assert.equal(exitCode, 0, capture.stderr.join("\n"));
    const queryPage = JSON.parse(capture.stdout[0]);
    assert.equal(queryPage.count, 1);
    assert.equal(queryPage.continuationToken, "q2");

    capture = createCaptureIo();
    exitCode = await runCli(
      ["--json", "iz", "query", "--from", "2026-01-01", "--to", "2026-01-02", "--all"],
      { io: capture.io, env, cwd: tempDir },
    );
    assert.equal(exitCode, 0, capture.stderr.join("\n"));
    const queryAll = JSON.parse(capture.stdout[0]);
    assert.equal(queryAll.count, 2);
    assert.equal(queryAll.continuationToken, "");

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "iz", "invoices"], { io: capture.io, env, cwd: tempDir });
    assert.equal(exitCode, 2);

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "iz", "invoices", "--iz", VALID_IZ, "--page-size", "5"], {
      io: capture.io,
      env,
      cwd: tempDir,
    });
    assert.equal(exitCode, 2);

    capture = createCaptureIo();
    exitCode = await runCli(
      [
        "--json",
        "iz",
        "invoices",
        "--iz",
        VALID_IZ,
        "--iz",
        VALID_IZ_2,
        "--iz",
        VALID_IZ,
        "--page-size",
        "10",
      ],
      { io: capture.io, env, cwd: tempDir },
    );
    assert.equal(exitCode, 2);

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "iz", "invoices", "--iz", "not-an-iz"], {
      io: capture.io,
      env,
      cwd: tempDir,
    });
    assert.equal(exitCode, 2);

    capture = createCaptureIo();
    exitCode = await runCli(
      ["--json", "iz", "invoices", "--iz", VALID_IZ, "--iz", VALID_IZ_2, "--page-size", "10"],
      { io: capture.io, env, cwd: tempDir },
    );
    assert.equal(exitCode, 0, capture.stderr.join("\n"));
    const invoicesPage = JSON.parse(capture.stdout[0]);
    assert.equal(invoicesPage.count, 1);
    assert.equal(invoicesPage.continuationToken, "i2");

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "iz", "invoices", "--iz", VALID_IZ, "--all"], {
      io: capture.io,
      env,
      cwd: tempDir,
    });
    assert.equal(exitCode, 0, capture.stderr.join("\n"));
    const invoicesAll = JSON.parse(capture.stdout[0]);
    assert.equal(invoicesAll.count, 2);
    assert.equal(invoicesAll.continuationToken, "");

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "iz", "invoices", "--iz", VALID_IZ, "--page-size", "500"], {
      io: capture.io,
      env,
      cwd: tempDir,
    });
    assert.equal(exitCode, 5);

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "iz", "by-ksef"], { io: capture.io, env, cwd: tempDir });
    assert.equal(exitCode, 2);

    capture = createCaptureIo();
    exitCode = await runCli(
      [
        "--json",
        "iz",
        "by-ksef",
        "--ksef-number",
        VALID_KSEF,
        "--ksef-number",
        VALID_KSEF,
        "--page-size",
        "10",
        "--base-url",
        baseUrl,
      ],
      { io: capture.io, env, cwd: tempDir },
    );
    assert.equal(exitCode, 0, capture.stderr.join("\n"));
    const byKsefRepeated = JSON.parse(capture.stdout[0]);
    assert.equal(byKsefRepeated.continuationToken, "b2");

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "iz", "by-ksef", "--ksef-number", "not-a-ksef"], {
      io: capture.io,
      env,
      cwd: tempDir,
    });
    assert.equal(exitCode, 2);

    capture = createCaptureIo();
    exitCode = await runCli(
      ["--json", "iz", "by-ksef", "--ksef-number", VALID_KSEF, "--page-size", "10"],
      { io: capture.io, env, cwd: tempDir },
    );
    assert.equal(exitCode, 0, capture.stderr.join("\n"));
    const byKsefPage = JSON.parse(capture.stdout[0]);
    assert.equal(byKsefPage.continuationToken, "b2");

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "iz", "by-ksef", "--ksef-number", VALID_KSEF, "--all"], {
      io: capture.io,
      env,
      cwd: tempDir,
    });
    assert.equal(exitCode, 0, capture.stderr.join("\n"));
    const byKsefAll = JSON.parse(capture.stdout[0]);
    assert.equal(byKsefAll.count, 2);

    capture = createCaptureIo();
    exitCode = await runCli(
      ["--json", "iz", "query", "--from", "2026-01-01", "--to", "2026-08-01"],
      { io: capture.io, env, cwd: tempDir },
    );
    assert.equal(exitCode, 2);

    capture = createCaptureIo();
    exitCode = await runCli(
      ["--json", "iz", "query", "--from", "2026-01-01", "--to", "2026-01-02", "--page-size", "20"],
      { io: capture.io, env, cwd: tempDir },
    );
    assert.equal(exitCode, 0, capture.stderr.join("\n"));
    assert.equal(JSON.parse(capture.stdout[0]).continuationToken, "");

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "iz", "invoices", "--iz", VALID_IZ, "--page-size", "20"], {
      io: capture.io,
      env,
      cwd: tempDir,
    });
    assert.equal(exitCode, 0, capture.stderr.join("\n"));
    assert.equal(JSON.parse(capture.stdout[0]).continuationToken, "");

    capture = createCaptureIo();
    exitCode = await runCli(
      ["--json", "iz", "by-ksef", "--ksef-number", VALID_KSEF, "--page-size", "20"],
      { io: capture.io, env, cwd: tempDir },
    );
    assert.equal(exitCode, 0, capture.stderr.join("\n"));
    assert.equal(JSON.parse(capture.stdout[0]).continuationToken, "");

    capture = createCaptureIo();
    exitCode = await runCli(["--help"], { io: capture.io, env, cwd: tempDir });
    assert.equal(exitCode, 0);
    assert.match(capture.stdout[0], /\biz\b/);
  } finally {
    await closeServer(server);
    await rm(tempDir, { recursive: true, force: true });
  }
});
