import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { test } from "node:test";
import {
  clearStoredTokens,
  formatTokenStoreWarning,
  loadStoredTokens,
  resolveTokenStore,
  saveStoredTokens,
} from "../../src/cli/tokenStore.ts";

test("resolveTokenStore and env policy branches", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ksef-token-store-"));
  try {
    const resolved = resolveTokenStore(
      {
        tokenStore: {
          policy: "env",
          filePath: "./custom-tokens.json",
          accessTokenEnvVar: "A",
          refreshTokenEnvVar: "R",
          ksefTokenEnvVar: "K",
        },
      },
      tempDir,
    );
    assert.equal(path.isAbsolute(resolved.filePath), true);
    assert.equal(resolved.accessTokenEnvVar, "A");
    assert.equal(resolved.refreshTokenEnvVar, "R");
    assert.equal(resolved.ksefTokenEnvVar, "K");

    const missingAccess = await loadStoredTokens("default", resolved, { A: "   " });
    assert.equal(missingAccess, null);

    const saved = await saveStoredTokens(
      "default",
      resolved,
      { accessToken: "token", updatedAt: "2026-01-01T00:00:00.000Z" },
    );
    assert.equal(saved, false);
    assert.equal(await clearStoredTokens("default", resolved), false);
    assert.equal(formatTokenStoreWarning("default", resolved), null);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("plaintext policy handles malformed/missing token files and clear no-op", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ksef-token-store-file-"));
  try {
    const tokenFile = path.join(tempDir, "tokens.json");
    const resolved = resolveTokenStore(
      { tokenStore: { policy: "plaintext", filePath: tokenFile } },
      tempDir,
    );

    await writeFile(tokenFile, "1", "utf8");
    const malformedObject = await loadStoredTokens("default", resolved, {});
    assert.equal(malformedObject, null);

    const clearedMissing = await clearStoredTokens("missing-profile", resolved);
    assert.equal(clearedMissing, true);

    const stored = await saveStoredTokens(
      "default",
      resolved,
      {
        accessToken: "access-token",
        refreshToken: "refresh-token",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    );
    assert.equal(stored, true);
    const persisted = JSON.parse(await readFile(tokenFile, "utf8"));
    assert.equal(persisted.profiles.default.accessToken, "access-token");

    await writeFile(tokenFile, "{broken", "utf8");
    await assert.rejects(
      () =>
        saveStoredTokens("default", resolved, {
          accessToken: "x",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
      SyntaxError,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
