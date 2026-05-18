import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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

