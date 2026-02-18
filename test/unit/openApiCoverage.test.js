import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const workspaceRoot = path.resolve(packageRoot, "..");
const openApiPath = path.join(workspaceRoot, "ksef-docs", "open-api.json");
const apiClientsRoot = path.join(packageRoot, "src", "api");

const helperOperationPatterns = [
  {
    method: "POST",
    pattern: /\bpostOperation\(\s*(?:`([^`]+)`|"([^"]+)")/g,
  },
  {
    method: "DELETE",
    pattern: /\bdeleteOperation\(\s*(?:`([^`]+)`|"([^"]+)")/g,
  },
  {
    method: "POST",
    pattern: /\bpostQuery\(\s*(?:`([^`]+)`|"([^"]+)")/g,
  },
  {
    method: "GET",
    pattern: /\bgetQuery\(\s*(?:`([^`]+)`|"([^"]+)")/g,
  },
  {
    method: "POST",
    pattern: /\bpost\(\s*(?:`([^`]+)`|"([^"]+)")/g,
  },
];

function normalizePath(value) {
  return value.replace(/\$\{[^}]+\}/g, "{}").replace(/\{[^}]+\}/g, "{}");
}

function extractSpecOperations(specPath) {
  const raw = fs.readFileSync(specPath, "utf8");
  const spec = JSON.parse(raw);
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

function extractClientOperations(clientsRoot) {
  const operations = new Set();
  const fileNames = fs
    .readdirSync(clientsRoot)
    .filter((fileName) => fileName.endsWith("Client.ts"));

  const directPattern =
    /method:\s*"(GET|POST|PUT|PATCH|DELETE)"[\s\S]*?path:\s*(?:`([^`]+)`|"([^"]+)")/g;

  for (const fileName of fileNames) {
    const source = fs.readFileSync(path.join(clientsRoot, fileName), "utf8");

    for (const match of source.matchAll(directPattern)) {
      const method = match[1];
      const operationPath = match[2] ?? match[3];
      if (!operationPath?.startsWith("/")) {
        continue;
      }
      operations.add(`${method} ${normalizePath(operationPath)}`);
    }

    for (const descriptor of helperOperationPatterns) {
      for (const match of source.matchAll(descriptor.pattern)) {
        const operationPath = match[1] ?? match[2];
        if (!operationPath?.startsWith("/")) {
          continue;
        }
        operations.add(`${descriptor.method} ${normalizePath(operationPath)}`);
      }
    }
  }

  return operations;
}

test("API clients cover all operations defined in OpenAPI spec", (t) => {
  if (!fs.existsSync(openApiPath)) {
    t.skip("open-api.json not found; coverage test requires monorepo layout");
    return;
  }

  const specOperations = extractSpecOperations(openApiPath);
  const clientOperations = extractClientOperations(apiClientsRoot);

  const missing = [...specOperations].filter((item) => !clientOperations.has(item)).sort();
  const extra = [...clientOperations].filter((item) => !specOperations.has(item)).sort();

  assert.deepEqual(
    missing,
    [],
    `Missing OpenAPI operations in TypeScript clients: ${missing.join(", ")}`,
  );
  assert.deepEqual(extra, [], `Extra operations not present in OpenAPI spec: ${extra.join(", ")}`);
});
