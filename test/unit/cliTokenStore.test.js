import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { test } from "node:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tokenStoreModuleUrl = pathToFileURL(path.resolve(__dirname, "../../src/cli/tokenStore.ts")).href;
const typescriptModuleUrl = pathToFileURL(
  path.resolve(__dirname, "../../node_modules/typescript/lib/typescript.js"),
).href;

async function runNodeWithTsLoader(script) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ksef-cli-token-store-loader-"));
  const loaderPath = path.join(tempDir, "loader.mjs");
  const loaderUrl = pathToFileURL(loaderPath).href;
  await writeFile(
    loaderPath,
    `
      import { readFile } from "node:fs/promises";
      import ts from ${JSON.stringify(typescriptModuleUrl)};
      import { fileURLToPath } from "node:url";
      import path from "node:path";

      export async function load(url, context, defaultLoad) {
        if (url.endsWith(".ts")) {
          const filePath = fileURLToPath(url);
          const source = await readFile(filePath, "utf8");
          const transpiled = ts.transpileModule(source, {
            compilerOptions: {
              target: ts.ScriptTarget.ES2022,
              module: ts.ModuleKind.ES2022,
              inlineSourceMap: true,
              inlineSources: true,
              sourceRoot: path.dirname(filePath),
            },
            fileName: filePath,
          });
          return { format: "module", shortCircuit: true, source: transpiled.outputText };
        }
        return defaultLoad(url, context, defaultLoad);
      }
    `,
    "utf8",
  );

  try {
    return spawnSync(
      process.execPath,
      ["--experimental-loader", loaderUrl, "--input-type=module", "--eval", script],
      {
        cwd: process.cwd(),
        env: process.env,
        encoding: "utf8",
      },
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

test("resolveTokenStore and env policy branches", async () => {
  const run = await runNodeWithTsLoader(`
    import assert from "node:assert/strict";
    import os from "node:os";
    import path from "node:path";
    import { mkdtemp, rm } from "node:fs/promises";
    import { resolveTokenStore, loadStoredTokens, saveStoredTokens, clearStoredTokens, formatTokenStoreWarning } from ${JSON.stringify(tokenStoreModuleUrl)};

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
  `);
  assert.equal(run.status, 0, `stdout:\n${run.stdout}\nstderr:\n${run.stderr}`);
});

test("plaintext policy handles malformed/missing token files and clear no-op", async () => {
  const run = await runNodeWithTsLoader(`
    import assert from "node:assert/strict";
    import os from "node:os";
    import path from "node:path";
    import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
    import { resolveTokenStore, loadStoredTokens, saveStoredTokens, clearStoredTokens } from ${JSON.stringify(tokenStoreModuleUrl)};

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
  `);
  assert.equal(run.status, 0, `stdout:\n${run.stdout}\nstderr:\n${run.stderr}`);
});
