import assert from "node:assert/strict";
import fs from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { test } from "node:test";
import { createZip } from "../../dist/index.js";
import { runCli } from "../../dist/cli/index.js";

const fixturesPath = path.resolve(process.cwd(), "test", "fixtures", "xades-fixtures.json");
const fixtures = JSON.parse(fs.readFileSync(fixturesPath, "utf8"));

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

function certPemToBase64Der(certPem) {
  return certPem.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s+/g, "");
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

const UPO_XML = `<?xml version="1.0" encoding="utf-8"?>
<Potwierdzenie>
  <NazwaPodmiotuPrzyjmujacego>KSeF</NazwaPodmiotuPrzyjmujacego>
  <NumerReferencyjnySesji>SESSION-1</NumerReferencyjnySesji>
  <Uwierzytelnienie>
    <IdKontekstu><Nip>1111111111</Nip></IdKontekstu>
    <NumerReferencyjnyTokenaKSeF>TOKEN-1</NumerReferencyjnyTokenaKSeF>
  </Uwierzytelnienie>
  <NazwaStrukturyLogicznej>Faktura</NazwaStrukturyLogicznej>
  <KodFormularza>FA (3)</KodFormularza>
  <Dokument>
    <NipSprzedawcy>1111111111</NipSprzedawcy>
    <NumerKSeFDokumentu>KSEF-INV-1</NumerKSeFDokumentu>
    <NumerFaktury>FV/1</NumerFaktury>
    <DataWystawieniaFaktury>2026-03-03</DataWystawieniaFaktury>
    <DataPrzeslaniaDokumentu>2026-03-03T12:00:00Z</DataPrzeslaniaDokumentu>
    <DataNadaniaNumeruKSeF>2026-03-03T12:01:00Z</DataNadaniaNumeruKSeF>
    <SkrotDokumentu>HASH</SkrotDokumentu>
    <TrybWysylki>Online</TrybWysylki>
  </Dokument>
</Potwierdzenie>`;

function handleAuthRoute(key, sendJson) {
  const certBase64Der = certPemToBase64Der(fixtures.rsaCertPem);
  if (key === "POST /v2/auth/challenge") {
    sendJson({
      challenge: "challenge-value",
      timestamp: "2026-03-03T12:00:00+01:00",
      timestampMs: 1741009200000,
      clientIp: "203.0.113.10",
    });
    return true;
  }
  if (key === "GET /v2/security/public-key-certificates") {
    sendJson([
      {
        certificateSerialNumber: "SERIAL-1",
        validFrom: "2026-01-01T00:00:00Z",
        validTo: "2027-01-01T00:00:00Z",
        usage: ["KsefTokenEncryption", "SymmetricKeyEncryption"],
        certificate: certBase64Der,
      },
    ]);
    return true;
  }
  if (key === "POST /v2/auth/ksef-token") {
    sendJson({
      authenticationToken: { token: "auth-token-1", validUntil: "2026-03-03T13:00:00Z" },
      referenceNumber: "AUTH-REF-1",
    });
    return true;
  }
  if (key === "GET /v2/auth/AUTH-REF-1") {
    sendJson({
      startDate: "2026-03-03T12:00:00Z",
      authenticationMethod: "Token",
      status: { code: 200, description: "Completed" },
    });
    return true;
  }
  if (key === "POST /v2/auth/token/redeem") {
    sendJson({
      accessToken: { token: "access-token-1", validUntil: "2099-03-03T14:00:00Z" },
      refreshToken: { token: "refresh-token-1", validUntil: "2099-03-10T14:00:00Z" },
    });
    return true;
  }
  return false;
}

function createServerWithRoutes(buildRoutes) {
  let address;
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const key = `${req.method} ${url.pathname}`;
    const sendJson = (payload) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(payload));
    };
    const sendXml = (xml) => {
      res.writeHead(200, { "Content-Type": "application/xml" });
      res.end(xml);
    };
    const sendStatus = (code) => {
      res.writeHead(code).end();
    };

    if (handleAuthRoute(key, sendJson)) {
      return;
    }
    const routes = buildRoutes({ address, sendJson, sendXml, sendStatus, req, res });
    const handler = routes[key];
    if (handler) {
      handler();
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: `${key} not mocked` }));
  });
  return {
    server,
    setAddress: (value) => {
      address = value;
    },
  };
}

function happyRoutes({ address, sendJson, sendXml, sendStatus }) {
  return {
    "POST /v2/sessions/online": () => sendJson({ referenceNumber: "ONLINE-REF-1" }),
    "POST /v2/sessions/online/ONLINE-REF-1/invoices": () =>
      sendJson({ referenceNumber: "INV-REF-1" }),
    "POST /v2/sessions/online/ONLINE-REF-1/close": () => sendJson({ ok: true }),
    "GET /v2/sessions/ONLINE-REF-1": () =>
      sendJson({
        status: { code: 200, description: "Completed" },
        upo: {
          pages: [
            {
              referenceNumber: "UPO-REF-1",
              downloadUrl: `http://127.0.0.1:${address.port}/download/online-upo.xml`,
            },
          ],
        },
      }),
    "GET /v2/sessions/ONLINE-REF-1/invoices/INV-REF-1": () =>
      sendJson({ status: { code: 200, description: "ok" }, ksefNumber: "KSEF-INV-1" }),
    "GET /v2/sessions/ONLINE-REF-1/invoices/INV-REF-1/upo": () => sendXml(UPO_XML),
    "GET /download/online-upo.xml": () => sendXml(UPO_XML),
    "POST /v2/sessions/batch": () =>
      sendJson({
        referenceNumber: "BATCH-REF-1",
        partUploadRequests: [
          {
            ordinalNumber: 1,
            method: "PUT",
            url: `http://127.0.0.1:${address.port}/upload/1`,
            headers: {},
          },
        ],
      }),
    "PUT /upload/1": () => sendStatus(200),
    "POST /v2/sessions/batch/BATCH-REF-1/close": () => sendJson({ ok: true }),
    "GET /v2/sessions/BATCH-REF-1": () =>
      sendJson({
        status: { code: 200, description: "Completed" },
        upo: { pages: [{ referenceNumber: "BUPO-REF-1" }] },
      }),
    "GET /v2/sessions/BATCH-REF-1/upo/BUPO-REF-1": () => sendXml(UPO_XML),
  };
}

function createSessionMockServer() {
  return createServerWithRoutes(happyRoutes);
}

async function initAndLogin(tempDir, baseUrl) {
  const env = { KSEF_CLI_HOME: tempDir };
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
  assert.equal(exitCode, 0, `${capture.stderr.join("\n")}\n${capture.stdout.join("\n")}`);

  const configPath = path.join(tempDir, "config.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  config.profiles.default.strictPresignedUrlValidation = false;
  config.profiles.default.allowPrivateNetworkPresignedUrls = true;
  await writeFile(configPath, JSON.stringify(config, null, 2), "utf8");

  capture = createCaptureIo();
  exitCode = await runCli(["--json", "auth", "login", "--token", "KSEF-TOKEN-1", "--profile", "default"], {
    io: capture.io,
    env,
    cwd: tempDir,
  });
  assert.equal(exitCode, 0, `${capture.stderr.join("\n")}\n${capture.stdout.join("\n")}`);
  return env;
}

async function seedOnlineCheckpoint(cliHome, id = "demo-online") {
  const directory = path.join(cliHome, "cache", "sessions", "default");
  await mkdir(directory, { recursive: true });
  const payload = {
    schemaVersion: 1,
    id,
    profile: "default",
    baseUrl: "https://api-test.ksef.mf.gov.pl/v2",
    kind: "online",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    stage: "opened",
    sessionState: {
      referenceNumber: "SESSION-ONLINE-1",
      encryptionData: {
        cipherKeyBase64: Buffer.from("k".repeat(32)).toString("base64"),
        cipherIvBase64: Buffer.from("i".repeat(16)).toString("base64"),
        encryptionInfo: {
          encryptedSymmetricKey: "enc-key",
          initializationVector: "enc-iv",
        },
      },
      upoV43: true,
    },
    sentInvoiceRefs: [],
  };
  await writeFile(path.join(directory, `${id}.json`), JSON.stringify(payload, null, 2), "utf8");
}

test("session list/show/export/drop/import operate on checkpoint files", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ksef-cli-session-"));
  try {
    await seedOnlineCheckpoint(tempDir);
    const env = { KSEF_CLI_HOME: tempDir };

    let capture = createCaptureIo();
    let exitCode = await runCli(["--json", "session", "list"], {
      io: capture.io,
      env,
      cwd: tempDir,
    });
    assert.equal(exitCode, 0);
    let payload = JSON.parse(capture.stdout[0]);
    assert.equal(payload.count, 1);
    assert.equal(payload.items[0].id, "demo-online");

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "session", "show", "--id", "demo-online"], {
      io: capture.io,
      env,
      cwd: tempDir,
    });
    assert.equal(exitCode, 0);
    payload = JSON.parse(capture.stdout[0]);
    assert.equal(payload.id, "demo-online");
    assert.equal(payload.checkpoint.kind, "online");

    const exportDir = path.join(tempDir, "exports");
    await mkdir(exportDir, { recursive: true });
    capture = createCaptureIo();
    exitCode = await runCli(
      ["--json", "session", "export", "--id", "demo-online", "--out", `${exportDir}/`],
      {
        io: capture.io,
        env,
        cwd: tempDir,
      },
    );
    assert.equal(exitCode, 0);
    payload = JSON.parse(capture.stdout[0]);
    const exportedPath = payload.path;
    const exportedRaw = await readFile(exportedPath, "utf8");
    assert.ok(exportedRaw.includes("\"demo-online\""));

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "session", "drop", "--id", "demo-online"], {
      io: capture.io,
      env,
      cwd: tempDir,
    });
    assert.equal(exitCode, 0);

    capture = createCaptureIo();
    exitCode = await runCli(
      ["--json", "session", "import", "--in", exportedPath, "--id", "demo-online-restored"],
      {
        io: capture.io,
        env,
        cwd: tempDir,
      },
    );
    assert.equal(exitCode, 0);
    payload = JSON.parse(capture.stdout[0]);
    assert.equal(payload.id, "demo-online-restored");

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "session", "import", "--in", exportedPath], {
      io: capture.io,
      env,
      cwd: tempDir,
    });
    assert.equal(exitCode, 0);
    payload = JSON.parse(capture.stdout[0]);
    assert.equal(payload.id, "demo-online");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("session online send validates --save-upo requires --wait-upo", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ksef-cli-session-"));
  try {
    const capture = createCaptureIo();
    const exitCode = await runCli(
      [
        "--json",
        "session",
        "online",
        "send",
        "--id",
        "demo-online",
        "--invoice-file",
        "invoice.xml",
        "--save-upo",
        "upo.xml",
      ],
      {
        io: capture.io,
        env: { KSEF_CLI_HOME: tempDir },
        cwd: tempDir,
      },
    );
    assert.equal(exitCode, 2);
    const errorPayload = JSON.parse(capture.stderr[0]);
    assert.match(errorPayload.error.message, /--save-upo requires --wait-upo/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("session batch close validates --save-upo requires --wait-upo", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ksef-cli-session-"));
  try {
    const capture = createCaptureIo();
    const exitCode = await runCli(
      ["--json", "session", "batch", "close", "--id", "demo-batch", "--save-upo", "upo.xml"],
      {
        io: capture.io,
        env: { KSEF_CLI_HOME: tempDir },
        cwd: tempDir,
      },
    );
    assert.equal(exitCode, 2);
    const errorPayload = JSON.parse(capture.stderr[0]);
    assert.match(errorPayload.error.message, /--save-upo requires --wait-upo/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("session upload/close validate numeric polling and parallelism flags", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ksef-cli-session-"));
  try {
    let capture = createCaptureIo();
    let exitCode = await runCli(
      ["--json", "session", "batch", "upload", "--id", "demo-batch", "--parallelism", "0"],
      {
        io: capture.io,
        env: { KSEF_CLI_HOME: tempDir },
        cwd: tempDir,
      },
    );
    assert.equal(exitCode, 2);
    let errorPayload = JSON.parse(capture.stderr[0]);
    assert.match(errorPayload.error.message, /--parallelism/i);

    capture = createCaptureIo();
    exitCode = await runCli(
      [
        "--json",
        "session",
        "online",
        "send",
        "--id",
        "demo-online",
        "--invoice-file",
        "invoice.xml",
        "--poll-interval-ms",
        "0",
      ],
      {
        io: capture.io,
        env: { KSEF_CLI_HOME: tempDir },
        cwd: tempDir,
      },
    );
    assert.equal(exitCode, 2);
    errorPayload = JSON.parse(capture.stderr[0]);
    assert.match(errorPayload.error.message, /--poll-interval-ms/i);

    capture = createCaptureIo();
    exitCode = await runCli(
      [
        "--json",
        "session",
        "online",
        "send",
        "--id",
        "demo-online",
        "--invoice-file",
        "invoice.xml",
        "--max-attempts",
        "0",
      ],
      {
        io: capture.io,
        env: { KSEF_CLI_HOME: tempDir },
        cwd: tempDir,
      },
    );
    assert.equal(exitCode, 2);
    errorPayload = JSON.parse(capture.stderr[0]);
    assert.match(errorPayload.error.message, /--max-attempts/i);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("session batch open validates source selection", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ksef-cli-session-"));
  try {
    const capture = createCaptureIo();
    const exitCode = await runCli(
      ["--json", "session", "batch", "open", "--id", "demo-batch"],
      {
        io: capture.io,
        env: { KSEF_CLI_HOME: tempDir },
        cwd: tempDir,
      },
    );
    assert.equal(exitCode, 2);
    const payload = JSON.parse(capture.stderr[0]);
    assert.match(payload.error.message, /Select exactly one batch input source/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("session command guards reject missing/invalid arguments before any network calls", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ksef-cli-guards-"));
  const env = { KSEF_CLI_HOME: tempDir };
  const run = async (args) => {
    const capture = createCaptureIo();
    const exitCode = await runCli(["--json", ...args], { io: capture.io, env, cwd: tempDir });
    return { exitCode, capture };
  };
  try {
    let result = await run(["session", "show"]);
    assert.equal(result.exitCode, 2);
    assert.match(result.capture.stderr.join("\n"), /Missing session id/);

    result = await run(["session", "show", "--id", "bad id!"]);
    assert.equal(result.exitCode, 2);
    assert.match(result.capture.stderr.join("\n"), /Invalid session id/);

    result = await run(["session", "export", "--id", "demo"]);
    assert.equal(result.exitCode, 2);
    assert.match(result.capture.stderr.join("\n"), /session export requires --out/);

    result = await run(["session", "import"]);
    assert.equal(result.exitCode, 2);
    assert.match(result.capture.stderr.join("\n"), /session import requires --in/);

    result = await run(["session", "online", "send", "--id", "demo"]);
    assert.equal(result.exitCode, 2);
    assert.match(result.capture.stderr.join("\n"), /requires --invoice-file/);

    result = await run([
      "session",
      "online",
      "send",
      "--id",
      "demo",
      "--invoice-file",
      "invoice.xml",
      "--poll-interval",
      "0",
    ]);
    assert.equal(result.exitCode, 2);
    assert.match(result.capture.stderr.join("\n"), /--poll-interval must be greater than zero/);

    const notADir = path.join(tempDir, "not-a-dir.txt");
    await writeFile(notADir, "x", "utf8");
    result = await run(["session", "batch", "open", "--id", "demo", "--dir", notADir]);
    assert.equal(result.exitCode, 2);
    assert.match(result.capture.stderr.join("\n"), /is not a directory/);

    const emptyDir = path.join(tempDir, "empty-dir");
    await mkdir(emptyDir, { recursive: true });
    result = await run(["session", "batch", "open", "--id", "demo", "--dir", emptyDir]);
    assert.equal(result.exitCode, 2);
    assert.match(result.capture.stderr.join("\n"), /No \.xml files found/);

    // A malformed checkpoint surfaces a config-level SessionStoreError.
    const checkpointDir = path.join(tempDir, "cache", "sessions", "default");
    await mkdir(checkpointDir, { recursive: true });
    await writeFile(path.join(checkpointDir, "broken.json"), "not-json{", "utf8");
    result = await run(["session", "show", "--id", "broken"]);
    assert.equal(result.exitCode, 3);
    assert.match(result.capture.stderr.join("\n"), /Invalid session checkpoint JSON/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("session commands surface auth errors when no token is stored", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ksef-cli-noauth-"));
  const mock = createSessionMockServer();
  const address = await listen(mock.server);
  mock.setAddress(address);
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const env = { KSEF_CLI_HOME: tempDir };
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

    const directory = path.join(tempDir, "cache", "sessions", "default");
    await mkdir(directory, { recursive: true });
    await writeFile(
      path.join(directory, "np.json"),
      JSON.stringify({
        schemaVersion: 1,
        id: "np",
        profile: "default",
        baseUrl,
        kind: "online",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        stage: "opened",
        sessionState: {
          referenceNumber: "ONLINE-REF-1",
          encryptionData: {
            cipherKeyBase64: Buffer.alloc(32, 1).toString("base64"),
            cipherIvBase64: Buffer.alloc(16, 2).toString("base64"),
            encryptionInfo: { encryptedSymmetricKey: "k", initializationVector: "i" },
          },
        },
        lastInvoiceRef: null,
        sentInvoiceRefs: [],
      }),
      "utf8",
    );

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "session", "status", "--id", "np"], {
      io: capture.io,
      env,
      cwd: tempDir,
    });
    assert.equal(exitCode, 4);
    assert.match(capture.stderr.join("\n"), /No access token found/);
  } finally {
    await closeServer(mock.server);
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("session online and batch lifecycle run against a mock KSeF server", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ksef-cli-lifecycle-"));
  const mock = createSessionMockServer();
  const address = await listen(mock.server);
  mock.setAddress(address);
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const env = await initAndLogin(tempDir, baseUrl);
    const run = async (args) => {
      const capture = createCaptureIo();
      const exitCode = await runCli(args, { io: capture.io, env, cwd: tempDir });
      return { exitCode, capture };
    };

    const invoiceFile = path.join(tempDir, "invoice.xml");
    await writeFile(invoiceFile, "<Invoice><Id>1</Id></Invoice>", "utf8");

    // --- Online session lifecycle ---
    let result = await run(["--json", "session", "online", "open", "--id", "o1", "--form-code", "FA3"]);
    assert.equal(result.exitCode, 0, result.capture.stderr.join("\n"));
    assert.match(result.capture.stdout[0], /"kind": "online"/);

    // Duplicate id triggers a SessionStoreError surfaced by the CLI.
    result = await run(["--json", "session", "online", "open", "--id", "o1", "--form-code", "FA3"]);
    assert.equal(result.exitCode, 2);
    assert.match(result.capture.stderr.join("\n"), /already exists/);

    const onlineUpo = path.join(tempDir, "online-upo.xml");
    result = await run([
      "--json",
      "session",
      "online",
      "send",
      "--id",
      "o1",
      "--invoice-file",
      invoiceFile,
      "--wait-status",
      "--wait-upo",
      "--save-upo",
      onlineUpo,
      "--poll-interval-ms",
      "1",
      "--max-attempts",
      "3",
    ]);
    assert.equal(result.exitCode, 0, result.capture.stderr.join("\n"));
    const sendPayload = JSON.parse(result.capture.stdout[0]);
    assert.equal(sendPayload.invoiceRef, "INV-REF-1");
    assert.equal(sendPayload.ksefNumber, "KSEF-INV-1");
    assert.match(await readFile(onlineUpo, "utf8"), /<Potwierdzenie>/);

    // Saving UPO again without overwrite fails; with overwrite succeeds.
    result = await run([
      "--json",
      "session",
      "online",
      "send",
      "--id",
      "o1",
      "--invoice-file",
      invoiceFile,
      "--wait-upo",
      "--save-upo",
      onlineUpo,
      "--poll-interval-ms",
      "1",
      "--max-attempts",
      "3",
    ]);
    assert.notEqual(result.exitCode, 0);
    assert.match(result.capture.stderr.join("\n"), /already exists/);

    result = await run([
      "--json",
      "session",
      "online",
      "send",
      "--id",
      "o1",
      "--invoice-file",
      invoiceFile,
      "--wait-upo",
      "--save-upo",
      onlineUpo,
      "--save-upo-overwrite",
      "--poll-interval-ms",
      "1",
      "--max-attempts",
      "3",
    ]);
    assert.equal(result.exitCode, 0, result.capture.stderr.join("\n"));

    // Waiting for UPO without --save-upo uses the seconds-based poll interval.
    result = await run([
      "--json",
      "session",
      "online",
      "send",
      "--id",
      "o1",
      "--invoice-file",
      invoiceFile,
      "--wait-upo",
      "--poll-interval",
      "1",
      "--max-attempts",
      "3",
    ]);
    assert.equal(result.exitCode, 0, result.capture.stderr.join("\n"));
    assert.match(result.capture.stdout[0], /"upoPath": ""/);

    // Generic session status resolves both session and invoice status.
    result = await run([
      "--json",
      "session",
      "status",
      "--id",
      "o1",
      "--invoice-ref",
      "INV-REF-1",
    ]);
    assert.equal(result.exitCode, 0, result.capture.stderr.join("\n"));
    assert.match(result.capture.stdout[0], /invoiceStatus/);

    result = await run(["--json", "session", "online", "close", "--id", "o1"]);
    assert.equal(result.exitCode, 0, result.capture.stderr.join("\n"));
    assert.match(result.capture.stdout[0], /"stage": "closed"/);

    // Sending on a closed checkpoint is rejected.
    result = await run([
      "--json",
      "session",
      "online",
      "send",
      "--id",
      "o1",
      "--invoice-file",
      invoiceFile,
    ]);
    assert.equal(result.exitCode, 2);
    assert.match(result.capture.stderr.join("\n"), /already closed/);

    // Wrong-kind guard: online command on a batch checkpoint.
    // --- Batch session lifecycle ---
    const zipPath = path.join(tempDir, "batch.zip");
    const zipBytes = await createZip([
      { fileName: "invoice-1.xml", content: Buffer.from("<Invoice><Id>1</Id></Invoice>", "utf8") },
    ]);
    await writeFile(zipPath, zipBytes);

    result = await run(["--json", "session", "batch", "open", "--id", "b1", "--zip", zipPath]);
    assert.equal(result.exitCode, 0, result.capture.stderr.join("\n"));
    assert.match(result.capture.stdout[0], /"kind": "batch"/);

    // Duplicate batch id triggers checkpoint conflict (and closes the opened session).
    result = await run(["--json", "session", "batch", "open", "--id", "b1", "--zip", zipPath]);
    assert.equal(result.exitCode, 2);
    assert.match(result.capture.stderr.join("\n"), /already exists/);

    // Directory source variant covers zip-from-directory building.
    const invoiceDir = path.join(tempDir, "batch-dir");
    await mkdir(path.join(invoiceDir, "nested"), { recursive: true });
    await writeFile(path.join(invoiceDir, "a.xml"), "<Invoice><Id>a</Id></Invoice>", "utf8");
    await writeFile(path.join(invoiceDir, "nested", "b.xml"), "<Invoice><Id>b</Id></Invoice>", "utf8");
    result = await run(["--json", "session", "batch", "open", "--id", "bdir", "--dir", invoiceDir]);
    assert.equal(result.exitCode, 0, result.capture.stderr.join("\n"));

    // Uploading a directory-sourced batch detects that the rebuilt archive changed.
    await writeFile(path.join(invoiceDir, "c.xml"), "<Invoice><Id>c</Id></Invoice>", "utf8");
    result = await run(["--json", "session", "batch", "upload", "--id", "bdir"]);
    assert.equal(result.exitCode, 2);
    assert.match(result.capture.stderr.join("\n"), /payload source changed/i);

    result = await run([
      "--json",
      "session",
      "batch",
      "upload",
      "--id",
      "b1",
      "--parallelism",
      "2",
    ]);
    assert.equal(result.exitCode, 0, result.capture.stderr.join("\n"));
    const uploadPayload = JSON.parse(result.capture.stdout[0]);
    assert.equal(uploadPayload.uploadedCount, 1);
    assert.equal(uploadPayload.totalParts, 1);

    // Re-running upload short-circuits when everything is uploaded.
    result = await run(["--json", "session", "batch", "upload", "--id", "b1"]);
    assert.equal(result.exitCode, 0, result.capture.stderr.join("\n"));
    assert.match(result.capture.stdout[0], /"uploadedCount": 1/);

    // A checkpoint that stores a relative payload path is resolved against the cwd.
    result = await run(["--json", "session", "batch", "open", "--id", "brel", "--zip", zipPath]);
    assert.equal(result.exitCode, 0, result.capture.stderr.join("\n"));
    const relCheckpointPath = path.join(tempDir, "cache", "sessions", "default", "brel.json");
    const relCheckpoint = JSON.parse(await readFile(relCheckpointPath, "utf8"));
    relCheckpoint.payloadSource.path = path.basename(zipPath);
    await writeFile(relCheckpointPath, JSON.stringify(relCheckpoint), "utf8");
    result = await run(["--json", "session", "batch", "upload", "--id", "brel"]);
    assert.equal(result.exitCode, 0, result.capture.stderr.join("\n"));
    assert.match(result.capture.stdout[0], /"uploadedCount": 1/);

    const batchUpoDir = path.join(tempDir, "batch-upo");
    await mkdir(batchUpoDir, { recursive: true });
    result = await run([
      "--json",
      "session",
      "batch",
      "close",
      "--id",
      "b1",
      "--wait-status",
      "--wait-upo",
      "--save-upo",
      `${batchUpoDir}/`,
      "--poll-interval-ms",
      "1",
      "--max-attempts",
      "3",
    ]);
    assert.equal(result.exitCode, 0, result.capture.stderr.join("\n"));
    const closePayload = JSON.parse(result.capture.stdout[0]);
    assert.equal(closePayload.upoRef, "BUPO-REF-1");

    // Closing an already-closed batch session short-circuits.
    result = await run(["--json", "session", "batch", "close", "--id", "b1"]);
    assert.equal(result.exitCode, 0, result.capture.stderr.join("\n"));

    // Closed session with --wait-upo skips re-close but still fetches status/UPO (no --save-upo).
    result = await run([
      "--json",
      "session",
      "batch",
      "close",
      "--id",
      "b1",
      "--wait-upo",
      "--poll-interval-ms",
      "1",
      "--max-attempts",
      "3",
    ]);
    assert.equal(result.exitCode, 0, result.capture.stderr.join("\n"));
    assert.match(result.capture.stdout[0], /"upoPath": ""/);

    // Wrong-kind guards.
    result = await run(["--json", "session", "online", "close", "--id", "b1"]);
    assert.equal(result.exitCode, 2);
    assert.match(result.capture.stderr.join("\n"), /not an online session/);

    result = await run(["--json", "session", "batch", "upload", "--id", "o1"]);
    assert.equal(result.exitCode, 2);
    assert.match(result.capture.stderr.join("\n"), /not a batch session/);

    // Unknown subcommands.
    for (const args of [
      ["--json", "session"],
      ["--json", "session", "bogus"],
      ["--json", "session", "online"],
      ["--json", "session", "online", "bogus"],
      ["--json", "session", "batch"],
      ["--json", "session", "batch", "bogus"],
    ]) {
      result = await run(args);
      assert.equal(result.exitCode, 2, `${args.join(" ")} -> ${result.capture.stdout.join("\n")}`);
    }
  } finally {
    await closeServer(mock.server);
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("session edge cases exercise timeouts, missing refs and status extraction", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ksef-cli-edge-"));
  const control = {
    onlineInvoicesResponse: { referenceNumber: "INV-REF-1" },
    onlineInvoiceStatus: { status: { code: 200 }, ksefNumber: "KSEF-INV-1" },
    onlineUpo404: false,
    batchStatus: { status: { code: 200 }, upo: { pages: [{ referenceNumber: "BUPO-REF-1" }] } },
  };
  const mock = createServerWithRoutes(({ address, sendJson, sendXml, sendStatus }) => ({
    "POST /v2/sessions/online": () => sendJson({ referenceNumber: "ONLINE-REF-1" }),
    "POST /v2/sessions/online/ONLINE-REF-1/invoices": () =>
      sendJson(control.onlineInvoicesResponse),
    "POST /v2/sessions/online/ONLINE-REF-1/close": () => sendJson({ ok: true }),
    "GET /v2/sessions/ONLINE-REF-1/invoices/INV-REF-1": () =>
      sendJson(control.onlineInvoiceStatus),
    "GET /v2/sessions/ONLINE-REF-1/invoices/INV-REF-1/upo": () =>
      control.onlineUpo404 ? sendStatus(404) : sendXml(UPO_XML),
    "POST /v2/sessions/batch": () =>
      sendJson({
        referenceNumber: "BATCH-REF-1",
        partUploadRequests: [
          {
            ordinalNumber: 1,
            method: "PUT",
            url: `http://127.0.0.1:${address.port}/upload/1`,
            headers: {},
          },
        ],
      }),
    "PUT /upload/1": () => sendStatus(200),
    "POST /v2/sessions/batch/BATCH-REF-1/close": () => sendJson({ ok: true }),
    "GET /v2/sessions/BATCH-REF-1": () => sendJson(control.batchStatus),
    "GET /v2/sessions/BATCH-REF-1/upo/BUPO-REF-1": () => sendXml(UPO_XML),
  }));
  const address = await listen(mock.server);
  mock.setAddress(address);
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const env = await initAndLogin(tempDir, baseUrl);
    const run = async (args) => {
      const capture = createCaptureIo();
      const exitCode = await runCli(args, { io: capture.io, env, cwd: tempDir });
      return { exitCode, capture };
    };
    const invoiceFile = path.join(tempDir, "invoice.xml");
    await writeFile(invoiceFile, "<Invoice><Id>1</Id></Invoice>", "utf8");
    const zipPath = path.join(tempDir, "batch.zip");
    await writeFile(
      zipPath,
      await createZip([
        { fileName: "invoice-1.xml", content: Buffer.from("<Invoice><Id>1</Id></Invoice>", "utf8") },
      ]),
    );

    const openOnline = (id) => run(["--json", "session", "online", "open", "--id", id, "--form-code", "FA3"]);
    const sendOnline = (id, extra) =>
      run(["--json", "session", "online", "send", "--id", id, "--invoice-file", invoiceFile, ...extra]);

    // Missing invoice reference in send response.
    control.onlineInvoicesResponse = {};
    assert.equal((await openOnline("o-missing")).exitCode, 0);
    let result = await sendOnline("o-missing", []);
    assert.equal(result.exitCode, 5);
    assert.match(result.capture.stderr.join("\n"), /does not contain invoice reference number/);
    control.onlineInvoicesResponse = { referenceNumber: "INV-REF-1" };

    // Invoice status shapes that never reach a terminal code time out.
    const statusTimeout = async (id, statusBody) => {
      control.onlineInvoiceStatus = statusBody;
      assert.equal((await openOnline(id)).exitCode, 0);
      return sendOnline(id, ["--wait-status", "--poll-interval-ms", "1", "--max-attempts", "1"]);
    };
    for (const [id, body] of [
      ["o-null", null],
      ["o-status-str", { status: "not-object" }],
      ["o-code-str", { status: { code: "x" } }],
      ["o-code-150", { status: { code: 150 } }],
    ]) {
      result = await statusTimeout(id, body);
      assert.equal(result.exitCode, 5, `${id}: ${result.capture.stderr.join("\n")}`);
      assert.match(result.capture.stderr.join("\n"), /Timed out while waiting for invoice status/);
    }

    // Terminal status but UPO download keeps failing (nested ksefNumber extraction).
    control.onlineInvoiceStatus = { status: { code: 200 }, invoice: { ksefNumber: "KSEF-NESTED" } };
    control.onlineUpo404 = true;
    assert.equal((await openOnline("o-upofail")).exitCode, 0);
    result = await sendOnline("o-upofail", [
      "--wait-status",
      "--wait-upo",
      "--poll-interval-ms",
      "1",
      "--max-attempts",
      "2",
    ]);
    assert.equal(result.exitCode, 5);
    assert.match(result.capture.stderr.join("\n"), /Timed out while waiting for invoice UPO/);
    control.onlineUpo404 = false;

    // Terminal status with no ksefNumber anywhere resolves to an empty value.
    control.onlineInvoiceStatus = { status: { code: 200 } };
    assert.equal((await openOnline("o-noksef")).exitCode, 0);
    result = await sendOnline("o-noksef", [
      "--wait-status",
      "--wait-upo",
      "--poll-interval-ms",
      "1",
      "--max-attempts",
      "3",
    ]);
    assert.equal(result.exitCode, 0, result.capture.stderr.join("\n"));
    assert.match(result.capture.stdout[0], /"ksefNumber": ""/);

    // Invoice object present but without a ksefNumber field.
    control.onlineInvoiceStatus = { status: { code: 200 }, invoice: {} };
    assert.equal((await openOnline("o-emptyinv")).exitCode, 0);
    result = await sendOnline("o-emptyinv", ["--wait-status", "--poll-interval-ms", "1", "--max-attempts", "3"]);
    assert.equal(result.exitCode, 0, result.capture.stderr.join("\n"));
    assert.match(result.capture.stdout[0], /"ksefNumber": ""/);

    // Batch close: session status has no UPO reference.
    control.batchStatus = { status: { code: 200 } };
    assert.equal(
      (await run(["--json", "session", "batch", "open", "--id", "b-noupo", "--zip", zipPath])).exitCode,
      0,
    );
    result = await run([
      "--json",
      "session",
      "batch",
      "close",
      "--id",
      "b-noupo",
      "--wait-upo",
      "--poll-interval-ms",
      "1",
      "--max-attempts",
      "3",
    ]);
    assert.equal(result.exitCode, 5);
    assert.match(result.capture.stderr.join("\n"), /UPO reference number is not available/);

    // Batch close: session status never becomes terminal.
    control.batchStatus = { status: { code: 150 } };
    assert.equal(
      (await run(["--json", "session", "batch", "open", "--id", "b-timeout", "--zip", zipPath])).exitCode,
      0,
    );
    result = await run([
      "--json",
      "session",
      "batch",
      "close",
      "--id",
      "b-timeout",
      "--wait-status",
      "--poll-interval-ms",
      "1",
      "--max-attempts",
      "1",
    ]);
    assert.equal(result.exitCode, 5);
    assert.match(result.capture.stderr.join("\n"), /Timed out while waiting for session status/);
  } finally {
    await closeServer(mock.server);
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("top-level send persists a session checkpoint and enforces UPO options", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ksef-cli-send-"));
  const mock = createSessionMockServer();
  const address = await listen(mock.server);
  mock.setAddress(address);
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const env = await initAndLogin(tempDir, baseUrl);
    const run = async (args) => {
      const capture = createCaptureIo();
      const exitCode = await runCli(args, { io: capture.io, env, cwd: tempDir });
      return { exitCode, capture };
    };

    const invoiceFile = path.join(tempDir, "invoice.xml");
    await writeFile(invoiceFile, "<Invoice><Id>1</Id></Invoice>", "utf8");
    const upoOut = path.join(tempDir, "send-upo.xml");

    let result = await run([
      "--json",
      "send",
      "--profile",
      "default",
      "--invoice-file",
      invoiceFile,
      "--form-code",
      "FA3",
      "--save-session",
      "s1",
      "--wait-upo",
      "--save-upo",
      upoOut,
      "--poll-interval-ms",
      "1",
      "--max-attempts",
      "3",
    ]);
    assert.equal(result.exitCode, 0, result.capture.stderr.join("\n"));
    const payload = JSON.parse(result.capture.stdout[0]);
    assert.equal(payload.sessionId, "s1");
    assert.match(await readFile(upoOut, "utf8"), /<Potwierdzenie>/);

    // Default poll settings when --wait-upo is used without explicit poll flags.
    const upoDefault = path.join(tempDir, "send-upo-default.xml");
    result = await run([
      "--json",
      "send",
      "--profile",
      "default",
      "--invoice-file",
      invoiceFile,
      "--form-code",
      "FA3",
      "--save-session",
      "s-default-poll",
      "--wait-upo",
      "--save-upo",
      upoDefault,
    ]);
    assert.equal(result.exitCode, 0, result.capture.stderr.join("\n"));
    assert.match(await readFile(upoDefault, "utf8"), /<Potwierdzenie>/);

    // Re-using the same session id fails because the checkpoint already exists.
    result = await run([
      "--json",
      "send",
      "--profile",
      "default",
      "--invoice-file",
      invoiceFile,
      "--form-code",
      "FA3",
      "--save-session",
      "s1",
    ]);
    assert.notEqual(result.exitCode, 0);
    assert.match(result.capture.stderr.join("\n"), /already exists/);

    // --save-upo without --wait-upo is rejected.
    result = await run([
      "--json",
      "send",
      "--profile",
      "default",
      "--invoice-file",
      invoiceFile,
      "--form-code",
      "FA3",
      "--save-upo",
      path.join(tempDir, "unused.xml"),
    ]);
    assert.equal(result.exitCode, 2);
    assert.match(result.capture.stderr.join("\n"), /requires --wait-upo/);
  } finally {
    await closeServer(mock.server);
    await rm(tempDir, { recursive: true, force: true });
  }
});
