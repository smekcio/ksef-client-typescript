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

test("lighthouse prefers --lighthouse-env over --env", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ksef-cli-"));
  try {
    const visited = [];
    const capture = createCaptureIo();
    const exitCode = await runCli(
      ["--json", "lighthouse", "--env", "TEST", "--lighthouse-env", "PRD"],
      {
        io: capture.io,
        env: { KSEF_CLI_HOME: tempDir },
        cwd: tempDir,
        fetchImpl: async (url) => {
          visited.push(url);
          return {
            ok: true,
            status: 200,
            json: async () => ({ status: "AVAILABLE" }),
          };
        },
      },
    );

    assert.equal(exitCode, 0);
    assert.equal(visited.length, 1);
    assert.equal(visited[0], "https://api-latarnia.ksef.mf.gov.pl/api/status");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("lighthouse returns usage error for invalid --lighthouse-env", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ksef-cli-"));
  try {
    const capture = createCaptureIo();
    const exitCode = await runCli(
      ["--json", "lighthouse", "--lighthouse-env", "invalid"],
      {
        io: capture.io,
        env: { KSEF_CLI_HOME: tempDir },
        cwd: tempDir,
      },
    );

    assert.equal(exitCode, 2);
    assert.equal(capture.stdout.length, 0);
    assert.equal(capture.stderr.length, 1);

    const payload = JSON.parse(capture.stderr[0]);
    assert.equal(payload.ok, false);
    assert.match(payload.error.message, /Unsupported --lighthouse-env/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("runCli supports short -h help flag", async () => {
  const capture = createCaptureIo();
  const exitCode = await runCli(["-h"], {
    io: capture.io,
    env: process.env,
    cwd: process.cwd(),
  });

  assert.equal(exitCode, 0);
  assert.ok(capture.stdout[0].includes("Usage:"));
  assert.equal(capture.stderr.length, 0);
});

test("init with env token policy does not print plaintext warning", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ksef-cli-"));
  try {
    const capture = createCaptureIo();
    const exitCode = await runCli(
      [
        "init",
        "--profile",
        "env-profile",
        "--token-store-policy",
        "env",
        "--context-type",
        "Nip",
        "--context-value",
        "1111111111",
      ],
      {
        io: capture.io,
        env: { KSEF_CLI_HOME: tempDir },
        cwd: tempDir,
      },
    );

    assert.equal(exitCode, 0);
    assert.equal(capture.stderr.length, 0);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("auth logout returns cleared=false for env token policy", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ksef-cli-"));
  try {
    const capture = createCaptureIo();
    await runCli(
      [
        "init",
        "--profile",
        "env-profile",
        "--token-store-policy",
        "env",
        "--context-type",
        "Nip",
        "--context-value",
        "1111111111",
      ],
      {
        io: capture.io,
        env: { KSEF_CLI_HOME: tempDir },
        cwd: tempDir,
      },
    );

    const logoutCapture = createCaptureIo();
    const exitCode = await runCli(["--json", "auth", "logout", "--profile", "env-profile"], {
      io: logoutCapture.io,
      env: { KSEF_CLI_HOME: tempDir },
      cwd: tempDir,
    });

    assert.equal(exitCode, 0);
    const payload = JSON.parse(logoutCapture.stdout[0]);
    assert.equal(payload.tokenStorePolicy, "env");
    assert.equal(payload.cleared, false);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("auth login fails with EXIT_AUTH when KSeF token is missing", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ksef-cli-"));
  try {
    await runCli(
      [
        "init",
        "--profile",
        "env-profile",
        "--token-store-policy",
        "env",
        "--context-type",
        "Nip",
        "--context-value",
        "1111111111",
      ],
      {
        io: createCaptureIo().io,
        env: { KSEF_CLI_HOME: tempDir },
        cwd: tempDir,
      },
    );

    const capture = createCaptureIo();
    const exitCode = await runCli(["--json", "auth", "login", "--profile", "env-profile"], {
      io: capture.io,
      env: {
        KSEF_CLI_HOME: tempDir,
      },
      cwd: tempDir,
    });

    assert.equal(exitCode, 4);
    const payload = JSON.parse(capture.stderr[0]);
    assert.equal(payload.ok, false);
    assert.match(payload.error.message, /Missing KSeF token/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("auth refresh with token in env reaches remote flow and returns EXIT_REMOTE", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ksef-cli-"));
  try {
    await runCli(
      [
        "init",
        "--profile",
        "env-profile",
        "--token-store-policy",
        "env",
        "--access-token-env",
        "MY_ACCESS",
        "--refresh-token-env",
        "MY_REFRESH",
      ],
      {
        io: createCaptureIo().io,
        env: { KSEF_CLI_HOME: tempDir },
        cwd: tempDir,
      },
    );

    const capture = createCaptureIo();
    const exitCode = await runCli(["--json", "auth", "refresh", "--profile", "env-profile"], {
      io: capture.io,
      env: {
        KSEF_CLI_HOME: tempDir,
        MY_ACCESS: "existing-access",
        MY_REFRESH: "existing-refresh",
      },
      cwd: tempDir,
    });

    assert.equal(exitCode, 5);
    const payload = JSON.parse(capture.stderr[0]);
    assert.equal(payload.ok, false);
    assert.equal(payload.error.exitCode, 5);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("auth refresh fails with EXIT_AUTH when refresh token is unavailable", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ksef-cli-"));
  try {
    await runCli(
      [
        "init",
        "--profile",
        "env-profile",
        "--token-store-policy",
        "env",
        "--access-token-env",
        "MY_ACCESS",
        "--refresh-token-env",
        "MY_REFRESH",
      ],
      {
        io: createCaptureIo().io,
        env: { KSEF_CLI_HOME: tempDir },
        cwd: tempDir,
      },
    );

    const capture = createCaptureIo();
    const exitCode = await runCli(["--json", "auth", "refresh", "--profile", "env-profile"], {
      io: capture.io,
      env: {
        KSEF_CLI_HOME: tempDir,
        MY_ACCESS: "existing-access",
      },
      cwd: tempDir,
    });

    assert.equal(exitCode, 4);
    const payload = JSON.parse(capture.stderr[0]);
    assert.equal(payload.ok, false);
    assert.match(payload.error.message, /Refresh token not available/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("profile use returns EXIT_CONFIG for missing profile", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ksef-cli-"));
  try {
    const capture = createCaptureIo();
    const exitCode = await runCli(["--json", "profile", "use", "missing-profile"], {
      io: capture.io,
      env: { KSEF_CLI_HOME: tempDir },
      cwd: tempDir,
    });

    assert.equal(exitCode, 3);
    const payload = JSON.parse(capture.stderr[0]);
    assert.equal(payload.ok, false);
    assert.equal(payload.error.exitCode, 3);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("upo get validates that exactly one selector is provided", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ksef-cli-"));
  try {
    await runCli(
      [
        "init",
        "--profile",
        "env-profile",
        "--token-store-policy",
        "env",
        "--access-token-env",
        "MY_ACCESS",
      ],
      {
        io: createCaptureIo().io,
        env: { KSEF_CLI_HOME: tempDir },
        cwd: tempDir,
      },
    );

    const capture = createCaptureIo();
    const exitCode = await runCli(
      [
        "--json",
        "upo",
        "get",
        "SESSION-REF",
        "--profile",
        "env-profile",
        "--invoice-ref",
        "INV-REF",
        "--ksef-number",
        "KSEF-NUMBER",
      ],
      {
        io: capture.io,
        env: { KSEF_CLI_HOME: tempDir, MY_ACCESS: "access-token-from-env" },
        cwd: tempDir,
      },
    );

    assert.equal(exitCode, 2);
    const payload = JSON.parse(capture.stderr[0]);
    assert.equal(payload.ok, false);
    assert.match(payload.error.message, /requires exactly one selector/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
