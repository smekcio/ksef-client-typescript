import assert from "node:assert/strict";
import { test } from "node:test";
import crypto from "node:crypto";
import { CryptographyService } from "../../dist/index.js";

test("AES encrypt/decrypt roundtrip", () => {
  const key = CryptographyService.generateAesKey();
  const iv = CryptographyService.generateIv();
  const data = Buffer.from("ksef-test-payload", "utf8");
  const encrypted = CryptographyService.encryptAes256Cbc(data, key, iv);
  const decrypted = CryptographyService.decryptAes256Cbc(encrypted, key, iv);
  assert.equal(decrypted.toString("utf8"), data.toString("utf8"));
});

test("RSA token encryption returns bytes", () => {
  const { publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const encrypted = CryptographyService.encryptKsefTokenRsa("token", Date.now(), pem);
  assert.ok(Buffer.isBuffer(encrypted));
  assert.ok(encrypted.length > 0);
});

test("EC token encryption returns bytes", () => {
  const { publicKey } = crypto.generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const encrypted = CryptographyService.encryptKsefTokenEc("token", Date.now(), pem, "java");
  assert.ok(Buffer.isBuffer(encrypted));
  assert.ok(encrypted.length > 0);
});
