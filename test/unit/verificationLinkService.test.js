import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";
import { VerificationLinkService, fromBase64Url, toBase64Url } from "../../dist/index.js";

function digestPath(pathToSign) {
  return crypto.createHash("sha256").update(pathToSign, "utf8").digest();
}

function extractSignedPath(url) {
  const signatureSegment = url.slice(url.lastIndexOf("/") + 1);
  const pathToSign = url.replace(/^https?:\/\//, "").replace(/\/[^/]+$/, "");
  return {
    pathToSign: Buffer.from(pathToSign, "utf8"),
    signature: fromBase64Url(signatureSegment),
  };
}

test("buildInvoiceVerificationUrl normalizes hash and date format", () => {
  const service = new VerificationLinkService({ baseQrUrl: "https://qr.example.test/" });
  const invoiceHash = Buffer.from("invoice-hash", "utf8").toString("base64");
  const url = service.buildInvoiceVerificationUrl(
    "5265877635",
    new Date("2025-01-05"),
    invoiceHash,
  );
  assert.equal(
    url,
    `https://qr.example.test/invoice/5265877635/05-01-2025/${toBase64Url(Buffer.from("invoice-hash", "utf8"))}`,
  );
});

test("buildCertificateVerificationUrl signs path for RSA key", () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" });
  const service = new VerificationLinkService({ baseQrUrl: "https://qr.example.test/" });
  const invoiceHash = Buffer.from("invoice-hash-rsa", "utf8").toString("base64");

  const url = service.buildCertificateVerificationUrl({
    sellerNip: "5265877635",
    contextIdentifierType: "Nip",
    contextIdentifierValue: "5265877635",
    certificateSerial: "SERIAL-RSA",
    invoiceHash,
    privateKeyPem,
  });

  const { pathToSign, signature } = extractSignedPath(url);

  const verified = crypto.verify(
    "sha256",
    pathToSign,
    {
      key: publicKey,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: 32,
    },
    signature,
  );
  assert.equal(verified, true);

  const verifiedOldBehavior = crypto.verify(
    "sha256",
    digestPath(pathToSign.toString("utf8")),
    {
      key: publicKey,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: 32,
    },
    signature,
  );
  assert.equal(verifiedOldBehavior, false);
});

test("buildCertificateVerificationUrl supports ECDSA DER signatures", () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" });
  const service = new VerificationLinkService({ baseQrUrl: "https://qr.example.test" });
  const invoiceHash = toBase64Url(Buffer.from("invoice-hash-ec", "utf8"));

  const url = service.buildCertificateVerificationUrl({
    sellerNip: "5265877635",
    contextIdentifierType: "Nip",
    contextIdentifierValue: "5265877635",
    certificateSerial: "SERIAL-EC",
    invoiceHash,
    privateKeyPem,
    signatureFormat: "der",
  });

  const { pathToSign, signature } = extractSignedPath(url);

  const verified = crypto.verify(
    "sha256",
    pathToSign,
    {
      key: publicKey,
      dsaEncoding: "der",
    },
    signature,
  );
  assert.equal(verified, true);

  const verifiedOldBehavior = crypto.verify(
    "sha256",
    digestPath(pathToSign.toString("utf8")),
    {
      key: publicKey,
      dsaEncoding: "der",
    },
    signature,
  );
  assert.equal(verifiedOldBehavior, false);
});

test("buildCertificateVerificationUrl uses IEEE-P1363 encoding for EC by default", () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" });
  const service = new VerificationLinkService({ baseQrUrl: "https://qr.example.test" });
  const invoiceHash = toBase64Url(Buffer.from("invoice-hash-ec-p1363", "utf8"));

  const url = service.buildCertificateVerificationUrl({
    sellerNip: "5265877635",
    contextIdentifierType: "Nip",
    contextIdentifierValue: "5265877635",
    certificateSerial: "SERIAL-EC-P1363",
    invoiceHash,
    privateKeyPem,
  });

  const { pathToSign, signature } = extractSignedPath(url);

  const verified = crypto.verify(
    "sha256",
    pathToSign,
    {
      key: publicKey,
      dsaEncoding: "ieee-p1363",
    },
    signature,
  );
  assert.equal(verified, true);

  const verifiedOldBehavior = crypto.verify(
    "sha256",
    digestPath(pathToSign.toString("utf8")),
    {
      key: publicKey,
      dsaEncoding: "ieee-p1363",
    },
    signature,
  );
  assert.equal(verifiedOldBehavior, false);
});

test("buildCertificateVerificationUrl accepts encrypted ECDSA keys when password is provided", () => {
  const passphrase = "secret-passphrase";
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const privateKeyPem = privateKey.export({
    type: "pkcs8",
    format: "pem",
    cipher: "aes-256-cbc",
    passphrase,
  });
  const service = new VerificationLinkService({ baseQrUrl: "https://qr.example.test/" });

  const url = service.buildCertificateVerificationUrl({
    sellerNip: "5265877635",
    contextIdentifierType: "Nip",
    contextIdentifierValue: "5265877635",
    certificateSerial: "SERIAL-EC-ENC",
    invoiceHash: Buffer.from("invoice-hash-ec-enc", "utf8").toString("base64"),
    privateKeyPem,
    privateKeyPassword: passphrase,
  });

  const { pathToSign, signature } = extractSignedPath(url);
  const verified = crypto.verify(
    "sha256",
    pathToSign,
    {
      key: publicKey,
      dsaEncoding: "ieee-p1363",
    },
    signature,
  );
  assert.equal(verified, true);
});

test("buildInvoiceVerificationUrl accepts preformatted date string and base64url hash", () => {
  const service = new VerificationLinkService({ baseQrUrl: "https://qr.example.test/" });
  const hashBase64Url = toBase64Url(Buffer.from("hash-url", "utf8"));
  const url = service.buildInvoiceVerificationUrl("5265877635", "31-12-2026", hashBase64Url);
  assert.equal(url, `https://qr.example.test/invoice/5265877635/31-12-2026/${hashBase64Url}`);
});

test("buildInvoiceVerificationUrl decodes base64url hash values containing URL-safe characters", () => {
  const service = new VerificationLinkService({ baseQrUrl: "https://qr.example.test/" });
  const base64UrlHash = "-w";
  const url = service.buildInvoiceVerificationUrl("5265877635", "01-01-2026", base64UrlHash);
  assert.equal(url, "https://qr.example.test/invoice/5265877635/01-01-2026/-w");
});

test("buildCertificateVerificationUrl rejects unsupported private key types", () => {
  const { privateKey } = crypto.generateKeyPairSync("ed25519");
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" });
  const service = new VerificationLinkService({ baseQrUrl: "https://qr.example.test/" });

  assert.throws(
    () =>
      service.buildCertificateVerificationUrl({
        sellerNip: "5265877635",
        contextIdentifierType: "Nip",
        contextIdentifierValue: "5265877635",
        certificateSerial: "SERIAL-ED",
        invoiceHash: Buffer.from("invoice-hash", "utf8").toString("base64"),
        privateKeyPem,
      }),
    /Unsupported private key type for signature/,
  );
});
