#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, "..");
const defaultOpenApiPath = path.resolve(packageRoot, "..", "ksef-api", "open-api.json");
const defaultClientsRoot = path.resolve(packageRoot, "src", "api");

function printUsage() {
  console.log("Usage: node scripts/check-openapi-coverage.mjs [--openapi <path>] [--src <path>]");
  console.log("");
  console.log("Defaults:");
  console.log(`  --openapi ${defaultOpenApiPath}`);
  console.log(`  --src     ${defaultClientsRoot}`);
}

function parseArgs(argv) {
  const args = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }

    if (arg.startsWith("--openapi=")) {
      args.openapi = arg.slice("--openapi=".length);
      continue;
    }

    if (arg === "--openapi") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Missing value for --openapi");
      }
      args.openapi = value;
      i += 1;
      continue;
    }

    if (arg.startsWith("--src=")) {
      args.src = arg.slice("--src=".length);
      continue;
    }

    if (arg === "--src") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Missing value for --src");
      }
      args.src = value;
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function normalizePath(value) {
  return value.replace(/\$\{[^}]+\}/g, "{}").replace(/\{[^}]+\}/g, "{}");
}

function extractSpecOperations(specPath) {
  const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
  const operations = new Set();

  for (const [operationPath, methods] of Object.entries(spec.paths ?? {})) {
    if (!methods || typeof methods !== "object") {
      continue;
    }

    for (const method of ["get", "post", "put", "patch", "delete"]) {
      if (Object.hasOwn(methods, method)) {
        operations.add(`${method.toUpperCase()} ${normalizePath(operationPath)}`);
      }
    }
  }

  return operations;
}

function addMatches(operations, source, method, pattern) {
  for (const match of source.matchAll(pattern)) {
    const operationPath = match[1] ?? match[2];
    if (!operationPath?.startsWith("/")) {
      continue;
    }
    operations.add(`${method} ${normalizePath(operationPath)}`);
  }
}

function extractClientOperations(clientsRoot) {
  const operations = new Set();
  const fileNames = fs
    .readdirSync(clientsRoot)
    .filter((fileName) => fileName.endsWith("Client.ts"))
    .sort();

  const directRequestPattern =
    /method:\s*"(GET|POST|PUT|PATCH|DELETE)"[\s\S]*?path:\s*(?:`([^`]+)`|"([^"]+)")/g;

  const directMethodPatterns = [
    ["GET", /\b(?:this\.)?get\(\s*(?:`([^`]+)`|"([^"]+)")/g],
    ["POST", /\b(?:this\.)?post\(\s*(?:`([^`]+)`|"([^"]+)")/g],
    ["PUT", /\b(?:this\.)?put\(\s*(?:`([^`]+)`|"([^"]+)")/g],
    ["PATCH", /\b(?:this\.)?patch\(\s*(?:`([^`]+)`|"([^"]+)")/g],
    ["DELETE", /\b(?:this\.)?delete\(\s*(?:`([^`]+)`|"([^"]+)")/g],
  ];

  const helperPatterns = [
    ["POST", /\bpostOperation\(\s*(?:`([^`]+)`|"([^"]+)")/g],
    ["DELETE", /\bdeleteOperation\(\s*(?:`([^`]+)`|"([^"]+)")/g],
    ["POST", /\bpostQuery\(\s*(?:`([^`]+)`|"([^"]+)")/g],
    ["GET", /\bgetQuery\(\s*(?:`([^`]+)`|"([^"]+)")/g],
    ["PUT", /\bputOperation\(\s*(?:`([^`]+)`|"([^"]+)")/g],
    ["PATCH", /\bpatchOperation\(\s*(?:`([^`]+)`|"([^"]+)")/g],
    ["PUT", /\bputQuery\(\s*(?:`([^`]+)`|"([^"]+)")/g],
    ["PATCH", /\bpatchQuery\(\s*(?:`([^`]+)`|"([^"]+)")/g],
  ];

  for (const fileName of fileNames) {
    const source = fs.readFileSync(path.join(clientsRoot, fileName), "utf8");

    for (const match of source.matchAll(directRequestPattern)) {
      const method = match[1];
      const operationPath = match[2] ?? match[3];
      if (!operationPath?.startsWith("/")) {
        continue;
      }
      operations.add(`${method} ${normalizePath(operationPath)}`);
    }

    for (const [method, pattern] of directMethodPatterns) {
      addMatches(operations, source, method, pattern);
    }

    for (const [method, pattern] of helperPatterns) {
      addMatches(operations, source, method, pattern);
    }
  }

  return operations;
}

function formatList(label, entries) {
  if (!entries.length) {
    return `${label}: none`;
  }

  return `${label}:\n${entries.map((entry) => `- ${entry}`).join("\n")}`;
}

function resolvePath(baseDir, value) {
  if (!value) {
    return null;
  }

  return path.isAbsolute(value) ? value : path.resolve(baseDir, value);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  const cwd = process.cwd();
  const openApiPath = resolvePath(cwd, args.openapi) ?? defaultOpenApiPath;
  const clientsRoot = resolvePath(cwd, args.src) ?? defaultClientsRoot;

  if (!fs.existsSync(openApiPath)) {
    throw new Error(`OpenAPI file not found: ${openApiPath}`);
  }

  if (!fs.existsSync(clientsRoot)) {
    throw new Error(`API clients directory not found: ${clientsRoot}`);
  }

  const specOperations = extractSpecOperations(openApiPath);
  const clientOperations = extractClientOperations(clientsRoot);

  const missing = [...specOperations].filter((item) => !clientOperations.has(item)).sort();
  const extra = [...clientOperations].filter((item) => !specOperations.has(item)).sort();

  console.log(`OpenAPI operations: ${specOperations.size}`);
  console.log(`Client operations: ${clientOperations.size}`);

  if (missing.length || extra.length) {
    console.error(formatList("Missing OpenAPI operations in TypeScript clients", missing));
    console.error(formatList("Extra operations not present in OpenAPI spec", extra));
    process.exitCode = 1;
    return;
  }

  console.log("OpenAPI coverage check passed.");
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
