import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CryptographyService,
  KsefError,
  KsefValidationError,
  OnlineSessionHandle,
  OnlineSessionWorkflow,
} from "../../dist/index.js";

const FORM_CODE = { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" };

test("OnlineSessionWorkflow validates required formCode", async () => {
  const workflow = new OnlineSessionWorkflow(
    {},
    { getPublicKeyCertificates: async () => [] },
    { request: async () => ({}) },
  );

  await assert.rejects(
    () => workflow.open({}),
    (error) => {
      assert.ok(error instanceof KsefValidationError);
      assert.equal(error.message, "formCode is required.");
      return true;
    },
  );
});

test("OnlineSessionWorkflow opens session and handle sends invoice with optional fields", async () => {
  const originalGetEncryptionData = CryptographyService.getEncryptionData;
  const originalPrepareInvoicePayload = CryptographyService.prepareInvoicePayload;
  const openCalls = [];
  const sendCalls = [];
  const sessionsClient = {
    openOnlineSession: async (request, upoV43) => {
      openCalls.push({ request, upoV43 });
      return { referenceNumber: "SESSION-REF-1" };
    },
    sendOnlineInvoice: async (referenceNumber, request) => {
      sendCalls.push({ referenceNumber, request });
      return { referenceNumber: "INVOICE-REF-1" };
    },
    closeOnlineSession: async () => {},
    getSessionStatus: async () => ({ status: { code: 100, description: "Processing" } }),
  };
  const securityClient = {
    getPublicKeyCertificates: async () => [
      { usage: ["SymmetricKeyEncryption"], certificate: "CERT_FROM_SECURITY" },
    ],
  };
  const http = { request: async () => "<upo/>" };
  const workflow = new OnlineSessionWorkflow(sessionsClient, securityClient, http);

  CryptographyService.getEncryptionData = () => ({
    cipherKey: Buffer.alloc(32, 1),
    cipherIv: Buffer.alloc(16, 2),
    encryptionInfo: {
      encryptedSymmetricKey: "encrypted-key",
      initializationVector: "iv-base64",
    },
  });
  CryptographyService.prepareInvoicePayload = () => ({
    invoiceHash: "invoice-hash",
    invoiceSize: 123,
    encryptedInvoiceHash: "encrypted-hash",
    encryptedInvoiceSize: 234,
    encryptedInvoiceContent: "encrypted-content",
  });

  try {
    const handle = await workflow.open({
      formCode: FORM_CODE,
      publicCertificateBase64Der: "CERT_FROM_OPTIONS",
      upoV43: true,
    });

    assert.ok(handle instanceof OnlineSessionHandle);
    assert.equal(handle.referenceNumber, "SESSION-REF-1");
    assert.equal(openCalls[0].upoV43, true);
    assert.deepEqual(openCalls[0].request, {
      formCode: FORM_CODE,
      encryption: {
        encryptedSymmetricKey: "encrypted-key",
        initializationVector: "iv-base64",
      },
    });

    await handle.sendInvoice({
      invoice: "<Invoice/>",
      offlineMode: true,
      hashOfCorrectedInvoice: "HASH",
    });

    assert.equal(sendCalls[0].referenceNumber, "SESSION-REF-1");
    assert.equal(sendCalls[0].request.offlineMode, true);
    assert.equal(sendCalls[0].request.hashOfCorrectedInvoice, "HASH");
    assert.equal(sendCalls[0].request.encryptedInvoiceContent, "encrypted-content");
  } finally {
    CryptographyService.getEncryptionData = originalGetEncryptionData;
    CryptographyService.prepareInvoicePayload = originalPrepareInvoicePayload;
  }
});

test("OnlineSessionWorkflow fetches certificate from security client when not provided", async () => {
  const originalGetEncryptionData = CryptographyService.getEncryptionData;
  let certificateFromCrypto;
  const sessionsClient = {
    openOnlineSession: async () => ({ referenceNumber: "SESSION-REF-2" }),
  };
  const securityClient = {
    getPublicKeyCertificates: async () => [
      { usage: ["SymmetricKeyEncryption"], certificate: "CERT_FROM_SECURITY" },
    ],
  };
  const http = { request: async () => "<upo/>" };
  const workflow = new OnlineSessionWorkflow(sessionsClient, securityClient, http);

  CryptographyService.getEncryptionData = (certificate) => {
    certificateFromCrypto = certificate;
    return {
      cipherKey: Buffer.alloc(32, 1),
      cipherIv: Buffer.alloc(16, 2),
      encryptionInfo: { encryptedSymmetricKey: "k", initializationVector: "i" },
    };
  };

  try {
    await workflow.open({ formCode: FORM_CODE });
    assert.equal(certificateFromCrypto, "CERT_FROM_SECURITY");
  } finally {
    CryptographyService.getEncryptionData = originalGetEncryptionData;
  }
});

test("OnlineSessionHandle waitForUpo covers success, failure and timeout branches", async () => {
  const statuses = [
    { status: { code: 100, description: "Processing" } },
    {
      status: { code: 200, description: "Done" },
      upo: { pages: [{ downloadUrl: "https://download/upo.xml" }] },
    },
  ];
  const sessionsClient = {
    getSessionStatus: async () => statuses.shift(),
    closeOnlineSession: async () => {},
    sendOnlineInvoice: async () => ({}),
  };
  const http = {
    request: async (options) => {
      assert.equal(options.path, "https://download/upo.xml");
      return "<upo-success/>";
    },
  };
  const handle = new OnlineSessionHandle(
    "SESSION-REF-3",
    { cipherKey: Buffer.alloc(32), cipherIv: Buffer.alloc(16), encryptionInfo: {} },
    sessionsClient,
    http,
  );

  const upo = await handle.waitForUpo({ pollIntervalMs: 0, maxAttempts: 3 });
  assert.equal(upo, "<upo-success/>");

  const failureHandle = new OnlineSessionHandle(
    "SESSION-REF-4",
    { cipherKey: Buffer.alloc(32), cipherIv: Buffer.alloc(16), encryptionInfo: {} },
    {
      getSessionStatus: async () => ({
        status: { code: 460, description: "Failed", details: ["bad-signature"] },
      }),
      closeOnlineSession: async () => {},
      sendOnlineInvoice: async () => ({}),
    },
    http,
  );
  await assert.rejects(
    () => failureHandle.waitForUpo({ pollIntervalMs: 0, maxAttempts: 1 }),
    (error) => {
      assert.ok(error instanceof KsefError);
      assert.equal(error.message, "Session failed: 460 Failed Details: bad-signature");
      return true;
    },
  );

  const timeoutHandle = new OnlineSessionHandle(
    "SESSION-REF-5",
    { cipherKey: Buffer.alloc(32), cipherIv: Buffer.alloc(16), encryptionInfo: {} },
    {
      getSessionStatus: async () => ({
        status: { code: 100, description: "Processing" },
      }),
      closeOnlineSession: async () => {},
      sendOnlineInvoice: async () => ({}),
    },
    http,
  );
  assert.equal(
    await timeoutHandle.waitForUpoParsed({ pollIntervalMs: 0, maxAttempts: 1 }),
    null,
  );
});
