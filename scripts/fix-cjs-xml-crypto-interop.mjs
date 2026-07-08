import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const distCjsPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist/index.cjs");
const source = fs.readFileSync(distCjsPath, "utf8");
const fixed = source.replaceAll("xmlCrypto__default.default", "xmlCrypto__default");

if (fixed === source) {
  if (!source.includes("xmlCrypto__default")) {
    throw new Error("Expected xml-crypto CJS interop markers were not found in dist/index.cjs.");
  }
} else {
  fs.writeFileSync(distCjsPath, fixed);
}
