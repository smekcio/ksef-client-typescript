import assert from "node:assert/strict";
import { test } from "node:test";
import { KsefClient, XadesKeyPair } from "../../dist/index.js";

const env = process.env.KSEF_ENV;
const contextType = process.env.KSEF_CONTEXT_TYPE;
const contextValue = process.env.KSEF_CONTEXT_VALUE;
const certPemRaw = process.env.KSEF_XADES_CERT_CRT;
const certPemB64 = process.env.KSEF_XADES_CERT_CRT_B64;
const privateKeyPemRaw = process.env.KSEF_XADES_PRIVATE_KEY_PEM;
const privateKeyPemB64 = process.env.KSEF_XADES_PRIVATE_KEY_PEM_B64;
const privateKeyPassword = process.env.KSEF_XADES_PRIVATE_KEY_PASSWORD;
const subjectIdentifierTypeRaw = process.env.KSEF_XADES_SUBJECT_IDENTIFIER_TYPE;
const enforceCompliance = process.env.KSEF_XADES_ENFORCE_COMPLIANCE !== "0";

const hasContext = env && contextType && contextValue;

function decodePem(rawValue, base64Value) {
  const raw = normalizePem(rawValue);
  if (raw) {
    return raw;
  }
  if (!base64Value) {
    return null;
  }
  try {
    return normalizePem(Buffer.from(base64Value, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function normalizePem(value) {
  if (!value || value.trim() === "") {
    return null;
  }
  const normalized = value.replace(/\\n/g, "\n").replace(/\r\n/g, "\n").trim();
  return normalized.length ? `${normalized}\n` : null;
}

test("e2e xades auth and query metadata", async (t) => {
  if (!hasContext) {
    t.skip("Missing KSEF_ENV/KSEF_CONTEXT_TYPE/KSEF_CONTEXT_VALUE");
    return;
  }

  const certificatePem = decodePem(certPemRaw, certPemB64);
  const privateKeyPem = decodePem(privateKeyPemRaw, privateKeyPemB64);
  if (!certificatePem || !privateKeyPem) {
    t.skip(
      "Missing KSEF_XADES_CERT_CRT or KSEF_XADES_CERT_CRT_B64 and KSEF_XADES_PRIVATE_KEY_PEM or KSEF_XADES_PRIVATE_KEY_PEM_B64",
    );
    return;
  }

  const keyPair = XadesKeyPair.fromPem({
    certificatePem,
    privateKeyPem,
    ...(privateKeyPassword ? { privateKeyPassword } : {}),
  });

  const subjectIdentifierType =
    subjectIdentifierTypeRaw === "certificateFingerprint"
      ? "certificateFingerprint"
      : "certificateSubject";

  const client = new KsefClient({ environment: env });
  const tokens = await client.workflows.auth.authenticateWithCertificate({
    keyPair,
    context: { type: contextType, value: contextValue },
    subjectIdentifierType,
    enforceXadesCompliance: enforceCompliance,
    pollIntervalMs: 2000,
    maxAttempts: 60,
  });
  client.authManager.setTokens(tokens);

  const now = new Date();
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const result = await client.invoices.queryInvoiceMetadata(
    {
      subjectType: "Subject1",
      dateRange: {
        dateType: "Issue",
        from: from.toISOString(),
        to: now.toISOString(),
      },
    },
    0,
    10,
    "Desc",
  );

  assert.ok(result);
});
