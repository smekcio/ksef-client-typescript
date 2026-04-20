import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { VerificationLinkService } from "../../dist/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, "../fixtures/verification-link");
const baseQrUrl = process.env.KSEF_QR_E2E_BASE_URL ?? "https://qr-test.ksef.mf.gov.pl";
const shouldRun = process.env.KSEF_E2E === "1";

function readFixture(relativePath) {
  return fs.readFileSync(path.join(fixturesDir, relativePath), "utf8");
}

function buildInvoiceHash() {
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?><offlineInvoice><number>E2E/QR/STATIC</number></offlineInvoice>';
  return crypto.createHash("sha256").update(xml, "utf8").digest("base64");
}

async function assertVerificationPage(url) {
  const response = await fetch(url, {
    signal: globalThis.AbortSignal.timeout(20_000),
  });
  assert.equal(response.status, 200);

  const body = await response.text();
  assert.match(body, /Certyfikat istnieje/i);
  assert.match(body, /Certyfikat jest aktywny/i);
  assert.match(body, /Podpis wystawcy jest prawid/i);
  assert.match(body, /Wystawca posiada uprawnienia do wystawienia faktury/i);
}

test("e2e verification link validates RSA QR II signatures", async (t) => {
  if (!shouldRun) {
    t.skip("Set KSEF_E2E=1 to run live QR verification tests");
    return;
  }

  const service = new VerificationLinkService({ baseQrUrl });
  const url = service.buildCertificateVerificationUrl({
    sellerNip: process.env.KSEF_QR_E2E_RSA_NIP ?? "7368335898",
    contextIdentifierType: "Nip",
    contextIdentifierValue: process.env.KSEF_QR_E2E_RSA_NIP ?? "7368335898",
    certificateSerial: process.env.KSEF_QR_E2E_RSA_SERIAL ?? "01732D26F736E531",
    invoiceHash: buildInvoiceHash(),
    privateKeyPem:
      process.env.KSEF_QR_E2E_RSA_KEY_PEM ??
      readFixture(
        process.env.KSEF_QR_E2E_RSA_KEY_PATH ?? "rsa_offline_private_key.pem",
      ),
    ...(process.env.KSEF_QR_E2E_RSA_KEY_PASSWORD
      ? { privateKeyPassword: process.env.KSEF_QR_E2E_RSA_KEY_PASSWORD }
      : {}),
    signatureFormat: process.env.KSEF_QR_E2E_RSA_SIGNATURE_FORMAT === "der" ? "der" : "p1363",
  });

  await assertVerificationPage(url);
});

test("e2e verification link validates ECDSA QR II signatures", async (t) => {
  if (!shouldRun) {
    t.skip("Set KSEF_E2E=1 to run live QR verification tests");
    return;
  }

  const sellerNip = process.env.KSEF_QR_E2E_ECDSA_NIP ?? "8096529464";
  const service = new VerificationLinkService({ baseQrUrl });
  const url = service.buildCertificateVerificationUrl({
    sellerNip,
    contextIdentifierType: "Nip",
    contextIdentifierValue: sellerNip,
    certificateSerial: process.env.KSEF_QR_E2E_ECDSA_SERIAL ?? "01D1732E43B9345E",
    invoiceHash: buildInvoiceHash(),
    privateKeyPem:
      process.env.KSEF_QR_E2E_ECDSA_KEY_PEM ??
      readFixture(
        process.env.KSEF_QR_E2E_ECDSA_KEY_PATH ?? "ecdsa_offline_private_key.pem",
      ),
    privateKeyPassword:
      process.env.KSEF_QR_E2E_ECDSA_KEY_PASSWORD ?? "ADadADad12!@adadad",
    signatureFormat:
      process.env.KSEF_QR_E2E_ECDSA_SIGNATURE_FORMAT === "der" ? "der" : "p1363",
  });

  await assertVerificationPage(url);
});
