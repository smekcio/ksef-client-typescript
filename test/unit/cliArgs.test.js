import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { register } from "node:module";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const argsModuleUrl = pathToFileURL(path.resolve(__dirname, "../../src/cli/args.ts")).href;
const typescriptModuleUrl = pathToFileURL(
  path.resolve(__dirname, "../../node_modules/typescript/lib/typescript.js"),
).href;

const loaderTempDir = mkdtempSync(path.join(os.tmpdir(), "ksef-cli-args-loader-"));
const loaderPath = path.join(loaderTempDir, "loader.mjs");
writeFileSync(
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
register(pathToFileURL(loaderPath).href, import.meta.url);
process.on("exit", () => {
  rmSync(loaderTempDir, { recursive: true, force: true });
});

let argsModulePromise;
async function loadArgsModule() {
  if (!argsModulePromise) {
    argsModulePromise = import(argsModuleUrl);
  }
  return argsModulePromise;
}

test("parseArgv handles sparse argv, -- separator and --key=value syntax", async () => {
  const { parseArgv } = await loadArgsModule();

  const sparse = [];
  sparse.length = 1;
  const sparseParsed = parseArgv(sparse);
  assert.deepEqual(sparseParsed.positionals, []);
  assert.deepEqual(sparseParsed.options, {});

  const parsed = parseArgv([
    "--profile=dev",
    "--page-size",
    "25",
    "--save-session",
    "resume-1",
    "--",
    "invoice",
    "query",
  ]);
  assert.equal(parsed.options.profile, "dev");
  assert.equal(parsed.options["page-size"], "25");
  assert.equal(parsed.options["save-session"], "resume-1");
  assert.deepEqual(parsed.positionals, ["invoice", "query"]);
});

test("parseArgv collects repeatable --ksef-number and --iz values", async () => {
  const { parseArgv, getStringListOption, getStringOption } = await loadArgsModule();
  const parsed = parseArgv([
    "iz",
    "generate",
    "--ksef-number",
    "n1",
    "--ksef-number=n2",
    "--iz",
    "iz-1",
    "--iz",
    "iz-2",
    "--from",
    "2026-01-01",
  ]);

  assert.deepEqual(getStringListOption(parsed.options, "ksef-number"), ["n1", "n2"]);
  assert.deepEqual(getStringListOption(parsed.options, "iz"), ["iz-1", "iz-2"]);
  assert.equal(getStringOption(parsed.options, "ksef-number"), "n2");
  assert.equal(getStringOption(parsed.options, "from"), "2026-01-01");
  assert.deepEqual(getStringListOption(parsed.options, "missing"), []);
});

test("option accessors cover boolean and number conversion branches", async () => {
  const { getBooleanOption, getNumberOption, getStringOption, getStringListOption } =
    await loadArgsModule();
  const options = {
    flagTrue: true,
    flagFalseString: "false",
    flagZeroString: "0",
    flagText: "yes",
    numeric: "123",
    notNumeric: "abc",
    plain: "text",
    listed: ["a"],
  };

  assert.equal(getBooleanOption(options, "flagTrue"), true);
  assert.equal(getBooleanOption(options, "flagFalseString"), false);
  assert.equal(getBooleanOption(options, "flagZeroString"), false);
  assert.equal(getBooleanOption(options, "flagText"), true);
  assert.equal(getBooleanOption(options, "missing"), false);

  assert.equal(getStringOption(options, "plain"), "text");
  assert.equal(getStringOption(options, "flagTrue"), undefined);
  assert.equal(getStringOption(options, "listed"), "a");
  assert.deepEqual(getStringListOption(options, "plain"), ["text"]);

  assert.equal(getNumberOption(options, "numeric"), 123);
  assert.equal(getNumberOption(options, "notNumeric"), undefined);
  assert.equal(getNumberOption(options, "missing"), undefined);
});
