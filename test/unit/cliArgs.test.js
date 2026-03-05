import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { test } from "node:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const argsModuleUrl = pathToFileURL(path.resolve(__dirname, "../../src/cli/args.ts")).href;
const typescriptModuleUrl = pathToFileURL(
  path.resolve(__dirname, "../../node_modules/typescript/lib/typescript.js"),
).href;

async function runNodeWithTsLoader(script) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ksef-cli-args-loader-"));
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

test("parseArgv handles sparse argv, -- separator and --key=value syntax", async () => {
  const run = await runNodeWithTsLoader(`
    import assert from "node:assert/strict";
    import { parseArgv } from ${JSON.stringify(argsModuleUrl)};

    const sparse = [];
    sparse.length = 1;
    const sparseParsed = parseArgv(sparse);
    assert.deepEqual(sparseParsed.positionals, []);
    assert.deepEqual(sparseParsed.options, {});

    const parsed = parseArgv([
      "--profile=dev",
      "--page-size",
      "25",
      "--",
      "invoice",
      "query",
    ]);
    assert.equal(parsed.options.profile, "dev");
    assert.equal(parsed.options["page-size"], "25");
    assert.deepEqual(parsed.positionals, ["invoice", "query"]);
  `);
  assert.equal(run.status, 0, `stdout:\n${run.stdout}\nstderr:\n${run.stderr}`);
});

test("option accessors cover boolean and number conversion branches", async () => {
  const run = await runNodeWithTsLoader(`
    import assert from "node:assert/strict";
    import { getBooleanOption, getNumberOption, getStringOption } from ${JSON.stringify(argsModuleUrl)};

    const options = {
      flagTrue: true,
      flagFalseString: "false",
      flagZeroString: "0",
      flagText: "yes",
      numeric: "123",
      notNumeric: "abc",
      plain: "text",
    };

    assert.equal(getBooleanOption(options, "flagTrue"), true);
    assert.equal(getBooleanOption(options, "flagFalseString"), false);
    assert.equal(getBooleanOption(options, "flagZeroString"), false);
    assert.equal(getBooleanOption(options, "flagText"), true);
    assert.equal(getBooleanOption(options, "missing"), false);

    assert.equal(getStringOption(options, "plain"), "text");
    assert.equal(getStringOption(options, "flagTrue"), undefined);

    assert.equal(getNumberOption(options, "numeric"), 123);
    assert.equal(getNumberOption(options, "notNumeric"), undefined);
    assert.equal(getNumberOption(options, "missing"), undefined);
  `);
  assert.equal(run.status, 0, `stdout:\n${run.stdout}\nstderr:\n${run.stderr}`);
});
