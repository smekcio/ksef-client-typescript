import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { test } from "node:test";
import { XadesKeyPair } from "../../dist/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesPath = path.join(__dirname, "..", "fixtures", "xades-fixtures.json");
const fixtures = JSON.parse(fs.readFileSync(fixturesPath, "utf8"));

test("XadesKeyPair.fromPemFiles loads PEM certificate and PEM private key", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ksef-xades-pem-files-"));
  try {
    const certPath = path.join(tempDir, "cert.pem");
    const keyPath = path.join(tempDir, "key.pem");
    await writeFile(certPath, fixtures.rsaCertPem, "utf8");
    await writeFile(keyPath, fixtures.rsaKeyPem, "utf8");

    const pair = XadesKeyPair.fromPemFiles({ certificatePath: certPath, privateKeyPath: keyPath });
    assert.match(pair.certificatePem, /BEGIN CERTIFICATE/);
    assert.equal(pair.privateKey.type, "private");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("XadesKeyPair.fromPemFiles loads DER certificate and DER private key", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ksef-xades-der-files-"));
  try {
    const certPath = path.join(tempDir, "cert.der");
    const keyPath = path.join(tempDir, "key.der");
    const certDer = new crypto.X509Certificate(fixtures.rsaCertPem).raw;
    const keyDer = crypto
      .createPrivateKey({ key: fixtures.rsaKeyPem, format: "pem" })
      .export({ format: "der", type: "pkcs8" });
    await writeFile(certPath, certDer);
    await writeFile(keyPath, keyDer);

    const pair = XadesKeyPair.fromPemFiles({ certificatePath: certPath, privateKeyPath: keyPath });
    assert.match(pair.certificatePem, /BEGIN CERTIFICATE/);
    assert.equal(pair.privateKey.type, "private");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("XadesKeyPair.fromPemFiles throws when private key format is unsupported", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ksef-xades-invalid-key-"));
  try {
    const certPath = path.join(tempDir, "cert.pem");
    const keyPath = path.join(tempDir, "key.bin");
    await writeFile(certPath, fixtures.rsaCertPem, "utf8");
    await writeFile(keyPath, Buffer.from("this-is-not-a-private-key", "utf8"));

    assert.throws(
      () => XadesKeyPair.fromPemFiles({ certificatePath: certPath, privateKeyPath: keyPath }),
      /Unable to load private key/,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("XadesKeyPair.fromPem accepts base64 DER certificate input", () => {
  const certDerBase64 = new crypto.X509Certificate(fixtures.rsaCertPem).raw.toString("base64");
  const pair = XadesKeyPair.fromPem({
    certificatePem: certDerBase64,
    privateKeyPem: fixtures.rsaKeyPem,
  });
  assert.match(pair.certificatePem, /BEGIN CERTIFICATE/);
  assert.equal(pair.privateKey.type, "private");
});

test("XadesKeyPair.fromPem covers base64 line split fallback when match returns null", () => {
  const certDerBase64 = new crypto.X509Certificate(fixtures.rsaCertPem).raw.toString("base64");
  const originalMatch = String.prototype.match;
  String.prototype.match = function patchedMatch(pattern) {
    if (this.valueOf() === certDerBase64 && String(pattern) === "/.{1,64}/g") {
      return null;
    }
    return originalMatch.call(this, pattern);
  };

  try {
    const pair = XadesKeyPair.fromPem({
      certificatePem: certDerBase64,
      privateKeyPem: fixtures.rsaKeyPem,
    });
    assert.equal(
      pair.certificatePem,
      "-----BEGIN CERTIFICATE-----\n\n-----END CERTIFICATE-----\n",
    );
    assert.equal(pair.privateKey.type, "private");
  } finally {
    String.prototype.match = originalMatch;
  }
});
