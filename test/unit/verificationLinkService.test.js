import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";
import {
  VerificationLinkService,
  fromBase64Url,
  toBase64Url,
} from "../../dist/index.js";

function digestPath(pathToSign) {
  return crypto.createHash("sha256").update(pathToSign, "utf8").digest();
}

test("buildInvoiceVerificationUrl normalizes hash and date format", () => {
  const service = new VerificationLinkService({ baseQrUrl: "https://qr.example.test/" });
  const invoiceHash = Buffer.from("invoice-hash", "utf8").toString("base64");
  const url = service.buildInvoiceVerificationUrl("5265877635", new Date("2025-01-05"), invoiceHash);
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

  const signatureSegment = url.slice(url.lastIndexOf("/") + 1);
  const pathWithoutProtocol = url
    .replace(/^https?:\/\//, "")
    .replace(/\/[^/]+$/, "");
  const digest = digestPath(pathWithoutProtocol);
  const signature = fromBase64Url(signatureSegment);

  const verified = crypto.verify(null, digest, {
    key: publicKey,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: crypto.constants.RSA_PSS_SALTLEN_MAX_SIGN,
  }, signature);
  assert.equal(verified, true);
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

  const signatureSegment = url.slice(url.lastIndexOf("/") + 1);
  const pathWithoutProtocol = url
    .replace(/^https?:\/\//, "")
    .replace(/\/[^/]+$/, "");
  const digest = digestPath(pathWithoutProtocol);
  const signature = fromBase64Url(signatureSegment);

  const verified = crypto.verify(null, digest, {
    key: publicKey,
    dsaEncoding: "der",
  }, signature);
  assert.equal(verified, true);
});
