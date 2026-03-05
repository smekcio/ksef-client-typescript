import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { test } from "node:test";
import { runCli } from "../../dist/cli/index.js";

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

function certPemToBase64Der(certPem) {
  return certPem.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s+/g, "");
}

test("CLI profile validation and patch branches", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ksef-cli-branches-profile-"));
  const env = { KSEF_CLI_HOME: tempDir };
  try {
    let capture = createCaptureIo();
    let exitCode = await runCli(
      ["init", "--profile", "default", "--context-type", "Nip", "--context-value", "1111111111"],
      { io: capture.io, env, cwd: tempDir },
    );
    assert.equal(exitCode, 0);

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "profile", "show"], { io: capture.io, env, cwd: tempDir });
    assert.equal(exitCode, 0);
    assert.match(capture.stdout[0], /"profile": "default"/);

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "profile", "use"], { io: capture.io, env, cwd: tempDir });
    assert.equal(exitCode, 2);

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "profile", "set"], { io: capture.io, env, cwd: tempDir });
    assert.equal(exitCode, 2);

    for (const args of [
      ["--json", "profile", "set", "broken-env", "--env", "bad"],
      ["--json", "profile", "set", "broken-lh", "--lighthouse-env", "bad"],
      ["--json", "profile", "set", "broken-ctx", "--context-type", "Nip"],
      ["--json", "profile", "set", "broken-store", "--token-store-policy", "weird"],
    ]) {
      capture = createCaptureIo();
      exitCode = await runCli(args, { io: capture.io, env, cwd: tempDir });
      assert.equal(exitCode, 2);
    }

    capture = createCaptureIo();
    exitCode = await runCli(
      [
        "--json",
        "profile",
        "set",
        "secure",
        "--token-store-policy",
        "env",
        "--token-file",
        "./secure-tokens.json",
        "--access-token-env",
        "ACCESS_CUSTOM",
        "--refresh-token-env",
        "REFRESH_CUSTOM",
        "--ksef-token-env",
        "KSEF_CUSTOM",
        "--context-type",
        "Nip",
        "--context-value",
        "1111111111",
      ],
      { io: capture.io, env, cwd: tempDir },
    );
    assert.equal(exitCode, 0);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("CLI lighthouse covers env parsing and fallback error aggregation", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ksef-cli-branches-lh-"));
  const env = { KSEF_CLI_HOME: tempDir };
  try {
    let capture = createCaptureIo();
    let exitCode = await runCli(
      ["--json", "lighthouse", "--env", "DEMO"],
      {
        io: capture.io,
        env,
        cwd: tempDir,
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          json: async () => ({ status: "AVAILABLE" }),
        }),
      },
    );
    assert.equal(exitCode, 0);

    capture = createCaptureIo();
    exitCode = await runCli(
      ["--json", "lighthouse", "--env", "BAD"],
      { io: capture.io, env, cwd: tempDir },
    );
    assert.equal(exitCode, 2);

    let call = 0;
    capture = createCaptureIo();
    exitCode = await runCli(
      ["--json", "lighthouse"],
      {
        io: capture.io,
        env,
        cwd: tempDir,
        fetchImpl: async () => {
          call += 1;
          if (call === 1 || call === 3) {
            return { ok: false, status: 503, json: async () => ({}) };
          }
          throw new Error("network down");
        },
      },
    );
    assert.equal(exitCode, 5);
    assert.match(capture.stderr[0], /Failed to query lighthouse endpoint/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("CLI auth context/missing token and invoice validation branches", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ksef-cli-branches-auth-"));
  const env = {
    KSEF_CLI_HOME: tempDir,
    ACCESS_TOKEN_FOR_TESTS: "access-token",
  };
  try {
    let capture = createCaptureIo();
    let exitCode = await runCli(
      [
        "init",
        "--profile",
        "default",
        "--token-store-policy",
        "env",
        "--access-token-env",
        "ACCESS_TOKEN_FOR_TESTS",
        "--base-url",
        "http://127.0.0.1:9",
      ],
      { io: capture.io, env, cwd: tempDir },
    );
    assert.equal(exitCode, 0);

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "invoice", "get", "KSEF-1", "--profile", "default"], {
      io: capture.io,
      env: { KSEF_CLI_HOME: tempDir },
      cwd: tempDir,
    });
    assert.equal(exitCode, 4);

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "auth", "login", "--token", "TOKEN"], {
      io: capture.io,
      env,
      cwd: tempDir,
    });
    assert.equal(exitCode, 3);

    capture = createCaptureIo();
    exitCode = await runCli(
      [
        "--json",
        "auth",
        "login",
        "--token",
        "TOKEN",
        "--context-type",
        "Nip",
        "--context-value",
        "1111111111",
      ],
      { io: capture.io, env, cwd: tempDir },
    );
    assert.equal(exitCode, 1);

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "invoice"], { io: capture.io, env, cwd: tempDir });
    assert.equal(exitCode, 2);

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "invoice", "get", "--profile", "default"], {
      io: capture.io,
      env,
      cwd: tempDir,
    });
    assert.equal(exitCode, 2);

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "invoice", "query", "--profile", "default"], {
      io: capture.io,
      env,
      cwd: tempDir,
    });
    assert.equal(exitCode, 2);

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "invoice", "weird", "--profile", "default"], {
      io: capture.io,
      env,
      cwd: tempDir,
    });
    assert.equal(exitCode, 2);

    const badFilters = path.join(tempDir, "bad-filters.json");
    await writeFile(badFilters, JSON.stringify({ subjectType: "Subject1" }), "utf8");
    capture = createCaptureIo();
    exitCode = await runCli(
      [
        "--json",
        "invoice",
        "query",
        "--profile",
        "default",
        "--filters-file",
        badFilters,
        "--sort-order",
        "Asc",
      ],
      { io: capture.io, env, cwd: tempDir },
    );
    assert.equal(exitCode, 2);
    assert.match(capture.stderr[0], /KsefValidationError/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("CLI upo output branches and plain error output branch", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ksef-cli-branches-upo-"));
  const server = createServer((req, res) => {
    if (req.method === "GET" && req.url === "/v2/sessions/SESSION-1/invoices/INV-1/upo") {
      res.writeHead(200, { "Content-Type": "application/xml" });
      res.end("<Potwierdzenie><A>1</A></Potwierdzenie>");
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "not mocked" }));
  });
  const address = await listen(server);
  const env = {
    KSEF_CLI_HOME: tempDir,
    ACCESS_TOKEN_FOR_TESTS: "access-token",
  };
  try {
    let capture = createCaptureIo();
    let exitCode = await runCli(
      [
        "init",
        "--profile",
        "default",
        "--token-store-policy",
        "env",
        "--access-token-env",
        "ACCESS_TOKEN_FOR_TESTS",
        "--base-url",
        `http://127.0.0.1:${address.port}`,
      ],
      { io: capture.io, env, cwd: tempDir },
    );
    assert.equal(exitCode, 0);

    const outputFile = path.join(tempDir, "upo.xml");
    capture = createCaptureIo();
    exitCode = await runCli(
      [
        "upo",
        "get",
        "SESSION-1",
        "--profile",
        "default",
        "--invoice-ref",
        "INV-1",
        "--output",
        outputFile,
      ],
      { io: capture.io, env, cwd: tempDir },
    );
    assert.equal(exitCode, 0);
    assert.match(await readFile(outputFile, "utf8"), /<Potwierdzenie>/);

    capture = createCaptureIo();
    exitCode = await runCli(
      ["upo", "get", "SESSION-1", "--profile", "default", "--invoice-ref", "INV-1"],
      { io: capture.io, env, cwd: tempDir },
    );
    assert.equal(exitCode, 0);
    assert.match(capture.stdout[0], /<Potwierdzenie>/);

    capture = createCaptureIo();
    exitCode = await runCli(
      ["--json", "upo", "get", "--profile", "default", "--invoice-ref", "INV-1"],
      { io: capture.io, env, cwd: tempDir },
    );
    assert.equal(exitCode, 2);

    const originalStdoutWrite = process.stdout.write;
    const originalStderrWrite = process.stderr.write;
    let stderrCollected = "";
    process.stdout.write = () => true;
    process.stderr.write = (chunk) => {
      stderrCollected += String(chunk);
      return true;
    };
    try {
      const plainExit = await runCli(["does-not-exist"], { env, cwd: tempDir });
      assert.equal(plainExit, 2);
      assert.match(stderrCollected, /Error: Unknown command/);
    } finally {
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;
    }
  } finally {
    await closeServer(server);
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("CLI invoice JSON/query/send branches include missing guards and send finally-close fallback", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ksef-cli-branches-invoice-"));
  const fixtures = JSON.parse(
    await readFile(path.join(process.cwd(), "test", "fixtures", "xades-fixtures.json"), "utf8"),
  );
  const certBase64Der = certPemToBase64Der(fixtures.rsaCertPem);

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/v2/invoices/ksef/KSEF-1") {
      res.writeHead(200, { "Content-Type": "application/xml" });
      res.end("<Invoice><Number>FV/1</Number></Invoice>");
      return;
    }
    if (req.method === "POST" && url.pathname === "/v2/invoices/query/metadata") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ items: [{ ksefNumber: "KSEF-1" }] }));
      return;
    }
    if (req.method === "GET" && url.pathname === "/v2/security/public-key-certificates") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify([
          {
            certificateSerialNumber: "SERIAL-1",
            validFrom: "2026-01-01T00:00:00Z",
            validTo: "2027-01-01T00:00:00Z",
            usage: ["SymmetricKeyEncryption"],
            certificate: certBase64Der,
          },
        ]),
      );
      return;
    }
    if (req.method === "POST" && url.pathname === "/v2/sessions/online") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ referenceNumber: "ONLINE-X" }));
      return;
    }
    if (req.method === "POST" && url.pathname === "/v2/sessions/online/ONLINE-X/invoices") {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "send failed" }));
      return;
    }
    if (req.method === "POST" && url.pathname === "/v2/sessions/online/ONLINE-X/close") {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "close failed" }));
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "not mocked" }));
  });

  const address = await listen(server);
  const env = {
    KSEF_CLI_HOME: tempDir,
    ACCESS_TOKEN_FOR_TESTS: "access-token",
  };

  try {
    let capture = createCaptureIo();
    let exitCode = await runCli(
      [
        "init",
        "--profile",
        "default",
        "--token-store-policy",
        "env",
        "--access-token-env",
        "ACCESS_TOKEN_FOR_TESTS",
        "--base-url",
        `http://127.0.0.1:${address.port}`,
        "--context-type",
        "Nip",
        "--context-value",
        "1111111111",
      ],
      { io: capture.io, env, cwd: tempDir },
    );
    assert.equal(exitCode, 0);

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "invoice", "get", "KSEF-1", "--profile", "default"], {
      io: capture.io,
      env,
      cwd: tempDir,
    });
    assert.equal(exitCode, 0);
    assert.match(capture.stdout[0], /"xml": "<Invoice>/);

    const filtersPath = path.join(tempDir, "filters.json");
    await writeFile(
      filtersPath,
      JSON.stringify({
        subjectType: "Subject1",
        dateRange: { dateType: "Issue", from: "2025-01-01", to: "2025-01-01" },
      }),
      "utf8",
    );

    capture = createCaptureIo();
    exitCode = await runCli(
      ["--json", "invoice", "query", "--profile", "default", "--filters-file", filtersPath],
      { io: capture.io, env, cwd: tempDir },
    );
    assert.equal(exitCode, 0);

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "send", "--profile", "default"], {
      io: capture.io,
      env,
      cwd: tempDir,
    });
    assert.equal(exitCode, 2);

    const invoiceFile = path.join(tempDir, "invoice.xml");
    await writeFile(invoiceFile, "<Invoice><Id>1</Id></Invoice>", "utf8");

    capture = createCaptureIo();
    exitCode = await runCli(
      ["--json", "send", "--profile", "default", "--invoice-file", invoiceFile],
      { io: capture.io, env, cwd: tempDir },
    );
    assert.equal(exitCode, 5);

    capture = createCaptureIo();
    exitCode = await runCli(
      ["--json", "send", "--profile", "default", "--invoice-file", invoiceFile, "--form-code", "FA2"],
      { io: capture.io, env, cwd: tempDir },
    );
    assert.equal(exitCode, 5);

    capture = createCaptureIo();
    exitCode = await runCli(
      [
        "--json",
        "send",
        "--profile",
        "default",
        "--invoice-file",
        invoiceFile,
        "--form-code",
        "NOT_SUPPORTED",
      ],
      { io: capture.io, env, cwd: tempDir },
    );
    assert.notEqual(exitCode, 0);
    assert.match(capture.stderr[0], /Unsupported form code/);
  } finally {
    await closeServer(server);
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("CLI lighthouse bootstrap/fallback and session-expired normalization branches", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ksef-cli-branches-bootstrap-"));
  const env = { KSEF_CLI_HOME: tempDir };
  try {
    await writeFile(
      path.join(tempDir, "config.json"),
      JSON.stringify({ version: 1, currentProfile: "default", profiles: {} }),
      "utf8",
    );

    let capture = createCaptureIo();
    let exitCode = await runCli(["--json", "lighthouse"], {
      io: capture.io,
      env,
      cwd: tempDir,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      }),
    });
    assert.equal(exitCode, 0);

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "lighthouse", "--profile", "missing"], {
      io: capture.io,
      env,
      cwd: tempDir,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      }),
    });
    assert.equal(exitCode, 3);

    await writeFile(
      path.join(tempDir, "config.json"),
      JSON.stringify({
        version: 1,
        currentProfile: "prd",
        profiles: {
          prd: { environment: "PRD" },
          test: {},
        },
      }),
      "utf8",
    );

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "lighthouse", "--profile", "prd"], {
      io: capture.io,
      env,
      cwd: tempDir,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      }),
    });
    assert.equal(exitCode, 0);

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "lighthouse", "--profile", "test"], {
      io: capture.io,
      env,
      cwd: tempDir,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      }),
    });
    assert.equal(exitCode, 0);

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "lighthouse", "--env="], {
      io: capture.io,
      env,
      cwd: tempDir,
    });
    assert.equal(exitCode, 2);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("CLI maps KsefSessionExpiredError from auth refresh failures", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ksef-cli-branches-expired-"));
  const server = createServer((req, res) => {
    if (req.method === "POST" && req.url === "/v2/auth/token/refresh") {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "refresh failed" }));
      return;
    }
    if (req.method === "GET" && req.url === "/v2/invoices/ksef/KSEF-1") {
      res.writeHead(200, { "Content-Type": "application/xml" });
      res.end("<Invoice/>");
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "not mocked" }));
  });
  const address = await listen(server);

  const env = { KSEF_CLI_HOME: tempDir };
  try {
    let capture = createCaptureIo();
    let exitCode = await runCli(
      [
        "init",
        "--profile",
        "default",
        "--base-url",
        `http://127.0.0.1:${address.port}`,
        "--context-type",
        "Nip",
        "--context-value",
        "1111111111",
      ],
      { io: capture.io, env, cwd: tempDir },
    );
    assert.equal(exitCode, 0);

    await writeFile(
      path.join(tempDir, "tokens.json"),
      JSON.stringify(
        {
          version: 1,
          profiles: {
            default: {
              accessToken: "expired-access",
              accessTokenValidUntil: "2000-01-01T00:00:00.000Z",
              refreshToken: "refresh-token",
              refreshTokenValidUntil: "2099-01-01T00:00:00.000Z",
              updatedAt: "2026-03-03T00:00:00.000Z",
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "invoice", "get", "KSEF-1", "--profile", "default"], {
      io: capture.io,
      env,
      cwd: tempDir,
    });
    assert.equal(exitCode, 4);
    assert.ok(capture.stderr.some((line) => /KsefSessionExpiredError/.test(line)));
  } finally {
    await closeServer(server);
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("CLI direct execution paths run as standalone module", () => {
  const helpRun = spawnSync(process.execPath, ["dist/cli/index.js", "--help"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(helpRun.status, 0);
  assert.match(helpRun.stdout, /Usage:/);

  const noArgvScript = `
    (async () => {
      process.argv[1] = undefined;
      await import('./dist/cli/index.js?coverage=' + Date.now());
    })();
  `;
  const noArgvRun = spawnSync(process.execPath, ["-e", noArgvScript], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(noArgvRun.status, 0);
});

test("CLI config store fallback and error branches", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ksef-cli-config-branches-"));
  const env = { KSEF_CLI_HOME: tempDir };
  try {
    await writeFile(path.join(tempDir, "config.json"), "1", "utf8");
    let capture = createCaptureIo();
    let exitCode = await runCli(["--json", "profile", "list"], { io: capture.io, env, cwd: tempDir });
    assert.equal(exitCode, 0);
    assert.match(capture.stdout[0], /default/);

    await writeFile(path.join(tempDir, "config.json"), "{bad", "utf8");
    capture = createCaptureIo();
    exitCode = await runCli(["--json", "profile", "list"], { io: capture.io, env, cwd: tempDir });
    assert.equal(exitCode, 1);

    await writeFile(
      path.join(tempDir, "config.json"),
      JSON.stringify({ version: 1, currentProfile: "default", profiles: { default: {} } }),
      "utf8",
    );
    capture = createCaptureIo();
    exitCode = await runCli(["--json", "profile", "show", "missing"], {
      io: capture.io,
      env,
      cwd: tempDir,
    });
    assert.equal(exitCode, 1);

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "health"], { io: capture.io, env, cwd: tempDir });
    assert.equal(exitCode, 0);
    assert.match(capture.stdout[0], /"baseUrl": "https:\/\/api-test\.ksef\.mf\.gov\.pl\/v2"/);

    await writeFile(
      path.join(tempDir, "config.json"),
      JSON.stringify({ version: 1, currentProfile: "", profiles: 1 }),
      "utf8",
    );
    capture = createCaptureIo();
    exitCode = await runCli(["--json", "profile", "show"], { io: capture.io, env, cwd: tempDir });
    assert.equal(exitCode, 1);
    assert.match(capture.stderr[0], /not found/);

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "profile", "show", "default"], {
      io: capture.io,
      env,
      cwd: tempDir,
    });
    assert.equal(exitCode, 1);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
