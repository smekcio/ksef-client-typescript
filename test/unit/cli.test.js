import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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

test("runCli returns help output", async () => {
  const capture = createCaptureIo();
  const exitCode = await runCli(["--help"], {
    io: capture.io,
    env: process.env,
    cwd: process.cwd(),
  });

  assert.equal(exitCode, 0);
  assert.ok(capture.stdout[0].includes("ksef-ts - KSeF TypeScript CLI"));
  assert.equal(capture.stderr.length, 0);
});

test("init writes config and prints plaintext token store warning", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ksef-cli-"));
  try {
    const capture = createCaptureIo();
    const exitCode = await runCli(
      ["init", "--profile", "prod", "--env", "PRD", "--context-type", "Nip", "--context-value", "1111111111"],
      {
        io: capture.io,
        env: { KSEF_CLI_HOME: tempDir },
        cwd: tempDir,
      },
    );

    assert.equal(exitCode, 0);
    assert.ok(capture.stderr[0].includes("stores access tokens in plaintext"));

    const configRaw = await readFile(path.join(tempDir, "config.json"), "utf8");
    const config = JSON.parse(configRaw);
    assert.equal(config.currentProfile, "prod");
    assert.equal(config.profiles.prod.environment, "PRD");
    assert.equal(config.profiles.prod.context.type, "Nip");
    assert.equal(config.profiles.prod.context.value, "1111111111");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("unknown command returns usage exit code and json error payload", async () => {
  const capture = createCaptureIo();
  const exitCode = await runCli(["--json", "does-not-exist"], {
    io: capture.io,
    env: process.env,
    cwd: process.cwd(),
  });

  assert.equal(exitCode, 2);
  assert.equal(capture.stdout.length, 0);
  assert.equal(capture.stderr.length, 1);

  const payload = JSON.parse(capture.stderr[0]);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.exitCode, 2);
});
