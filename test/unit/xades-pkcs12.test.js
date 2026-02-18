import assert from "node:assert/strict";
import { test } from "node:test";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { XadesKeyPair } from "../../dist/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesPath = path.join(__dirname, "..", "fixtures", "xades-fixtures.json");
const fixtures = JSON.parse(fs.readFileSync(fixturesPath, "utf8"));

async function hasNodeForge() {
  try {
    await import("node-forge");
    return true;
  } catch {
    return false;
  }
}

function generatePkcs12Bundle() {
  return {
    pkcs12Base64: fixtures.pkcs12Base64,
    pkcs12Password: fixtures.pkcs12Password,
    leafPem: fixtures.leafPem,
    rootPem: fixtures.rootPem,
  };
}

test(
  "XadesKeyPair.fromPkcs12 selects leaf cert and builds chain",
  { skip: !(await hasNodeForge()) },
  async () => {
    const bundle = generatePkcs12Bundle();
    const pkcs12Bytes = Buffer.from(bundle.pkcs12Base64, "base64");

    const pair = await XadesKeyPair.fromPkcs12({
      pkcs12Bytes,
      pkcs12Password: bundle.pkcs12Password,
    });

    assert.match(pair.certificatePem, /BEGIN CERTIFICATE/);
    assert.match(new crypto.X509Certificate(pair.certificatePem).subject, /CN=Leaf/);
    assert.ok(Array.isArray(pair.certificateChainPem));
    assert.equal(pair.certificateChainPem.length, 1);
    assert.match(new crypto.X509Certificate(pair.certificateChainPem[0]).subject, /CN=Root/);
  },
);
