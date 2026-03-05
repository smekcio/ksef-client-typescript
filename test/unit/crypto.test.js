import assert from "node:assert/strict";
import { test } from "node:test";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { CryptographyService } from "../../dist/index.js";

const fixturesPath = path.resolve(process.cwd(), "test", "fixtures", "xades-fixtures.json");
const fixtures = JSON.parse(fs.readFileSync(fixturesPath, "utf8"));

function certPemToBase64Der(certPem) {
  return certPem.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s+/g, "");
}

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

test("encryptKsefToken supports rsa and ec output wrappers", () => {
  const { publicKey: rsaPublicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const rsaPem = rsaPublicKey.export({ type: "spki", format: "pem" }).toString();
  const rsaToken = CryptographyService.encryptKsefToken("token", Date.now(), rsaPem, "rsa");
  assert.equal(typeof rsaToken, "string");
  assert.ok(Buffer.from(rsaToken, "base64").length > 0);

  const { publicKey: ecPublicKey } = crypto.generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  const ecPem = ecPublicKey.export({ type: "spki", format: "pem" }).toString();
  const ecToken = CryptographyService.encryptKsefToken(
    "token",
    Date.now(),
    ecPem,
    "ec",
    "csharp",
  );
  assert.equal(typeof ecToken, "string");
  assert.ok(Buffer.from(ecToken, "base64").length > 0);
});

test("certificate normalization supports PEM and base64 DER", () => {
  const { publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const derBase64 = publicKey.export({ type: "spki", format: "der" }).toString("base64");

  const normalizedPem = CryptographyService.normalizeCertificatePem(pem.trim());
  assert.match(normalizedPem, /-----BEGIN PUBLIC KEY-----/);
  assert.ok(normalizedPem.endsWith("\n"));

  const convertedPem = CryptographyService.normalizeCertificatePem(derBase64);
  assert.match(convertedPem, /-----BEGIN CERTIFICATE-----/);

  const pemWithTrailingNewline = `${pem.trim()}\n`;
  assert.equal(
    CryptographyService.normalizeCertificatePem(pemWithTrailingNewline),
    pemWithTrailingNewline,
  );

  const emptyPem = CryptographyService.toPemFromBase64Der("", "PUBLIC KEY");
  assert.match(emptyPem, /BEGIN PUBLIC KEY/);
});

test("hash and metadata helpers return deterministic values", () => {
  const payload = Buffer.from("ksef-hash", "utf8");
  const expectedHash = crypto.createHash("sha256").update(payload).digest("base64");

  assert.equal(CryptographyService.sha256Base64(payload), expectedHash);
  assert.match(CryptographyService.sha256Base64Url(payload), /^[A-Za-z0-9_-]+$/);

  const metadata = CryptographyService.getMetaData(payload);
  assert.equal(metadata.fileSize, payload.length);
  assert.equal(metadata.hashSha256Base64, expectedHash);
});

test("getEncryptionData encrypts symmetric key for provided certificate", () => {
  const privateKeyPem = fixtures.rsaKeyPem;
  const certBase64Der = certPemToBase64Der(fixtures.rsaCertPem);
  const encryptionData = CryptographyService.getEncryptionData(certBase64Der);

  assert.equal(encryptionData.cipherKey.length, 32);
  assert.equal(encryptionData.cipherIv.length, 16);
  assert.equal(typeof encryptionData.encryptionInfo.encryptedSymmetricKey, "string");
  assert.equal(typeof encryptionData.encryptionInfo.initializationVector, "string");

  const decryptedKey = crypto.privateDecrypt(
    {
      key: privateKeyPem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    Buffer.from(encryptionData.encryptionInfo.encryptedSymmetricKey, "base64"),
  );
  assert.deepEqual(decryptedKey, encryptionData.cipherKey);
});

test("prepareInvoicePayload computes hashes and encrypted content metadata", () => {
  const invoiceXml = Buffer.from("<Invoice>test</Invoice>", "utf8");
  const key = CryptographyService.generateAesKey();
  const iv = CryptographyService.generateIv();

  const prepared = CryptographyService.prepareInvoicePayload(invoiceXml, key, iv);

  assert.equal(prepared.invoiceSize, invoiceXml.length);
  assert.equal(prepared.invoiceHash, CryptographyService.sha256Base64(invoiceXml));
  assert.ok(prepared.encryptedInvoiceSize > 0);
  assert.equal(
    prepared.encryptedInvoiceHash,
    CryptographyService.sha256Base64(Buffer.from(prepared.encryptedInvoiceContent, "base64")),
  );
});
