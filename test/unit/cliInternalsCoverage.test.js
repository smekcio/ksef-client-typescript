import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distCliPath = path.resolve(__dirname, "../../dist/cli/index.js");
const distCliMapPath = path.resolve(__dirname, "../../dist/cli/index.js.map");
const distRootPath = path.resolve(__dirname, "../../dist");

async function loadCliInternalsModule() {
  const tempBaseDir = path.resolve(__dirname, "../../.tmp");
  await mkdir(tempBaseDir, { recursive: true });
  const tempDir = await mkdtemp(path.join(tempBaseDir, "ksef-cli-internals-"));
  const tempModulePath = path.join(tempDir, "index.js");
  const tempMapPath = path.join(tempDir, "index.js.map");

  try {
    const distEntries = await readdir(distRootPath, { withFileTypes: true });
    for (const entry of distEntries) {
      if (!entry.isFile()) {
        continue;
      }
      if (!entry.name.endsWith(".js")) {
        continue;
      }
      if (!entry.name.startsWith("chunk-") && !entry.name.startsWith("libxmljs2-")) {
        continue;
      }
      await copyFile(path.join(distRootPath, entry.name), path.join(tempBaseDir, entry.name));
    }

    const source = await readFile(distCliPath, "utf8");
    const withoutSourceMapComment = source.replace(
      /\n\/\/# sourceMappingURL=index\.js\.map\s*$/u,
      "",
    );
    const patched = `${withoutSourceMapComment}
export { clearStoredTokens, resolveTokenStore, saveStoredTokens };
//# sourceMappingURL=index.js.map
`;

    await writeFile(tempModulePath, patched, "utf8");
    await copyFile(distCliMapPath, tempMapPath);

    const moduleUrl = `${pathToFileURL(tempModulePath).href}?cacheBust=${Date.now()}`;
    const loaded = await import(moduleUrl);

    return {
      module: loaded,
      dispose: async () => {
        await rm(tempDir, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}

test("CLI internals: env token store save returns false", async () => {
  const loaded = await loadCliInternalsModule();
  try {
    const { resolveTokenStore, saveStoredTokens } = loaded.module;
    const cliHome = await mkdtemp(path.join(os.tmpdir(), "ksef-cli-home-"));
    try {
      const tokenStore = resolveTokenStore(
        {
          tokenStore: {
            policy: "env",
            accessTokenEnvVar: "A",
            refreshTokenEnvVar: "R",
            ksefTokenEnvVar: "K",
          },
        },
        cliHome,
      );

      const saved = await saveStoredTokens("default", tokenStore, {
        accessToken: "token",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
      assert.equal(saved, false);
    } finally {
      await rm(cliHome, { recursive: true, force: true });
    }
  } finally {
    await loaded.dispose();
  }
});

test("CLI internals: plaintext token store handles malformed content and missing profile", async () => {
  const loaded = await loadCliInternalsModule();
  try {
    const { clearStoredTokens, resolveTokenStore } = loaded.module;
    const cliHome = await mkdtemp(path.join(os.tmpdir(), "ksef-cli-home-"));
    try {
      const tokenFile = path.join(cliHome, "tokens.json");
      const tokenStore = resolveTokenStore(
        {
          tokenStore: {
            policy: "plaintext",
            filePath: tokenFile,
          },
        },
        cliHome,
      );

      await writeFile(tokenFile, "1", "utf8");
      const clearedMissingProfile = await clearStoredTokens("missing-profile", tokenStore);
      assert.equal(clearedMissingProfile, true);

      await writeFile(tokenFile, "{broken", "utf8");
      await assert.rejects(() => clearStoredTokens("missing-profile", tokenStore), SyntaxError);
    } finally {
      await rm(cliHome, { recursive: true, force: true });
    }
  } finally {
    await loaded.dispose();
  }
});
