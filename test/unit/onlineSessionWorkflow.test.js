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

test("OnlineSessionHandle failure message omits details when status.details is empty", async () => {
  const handle = new OnlineSessionHandle(
    "SESSION-REF-ERR",
    { cipherKey: Buffer.alloc(32), cipherIv: Buffer.alloc(16), encryptionInfo: {} },
    {
      getSessionStatus: async () => ({
        status: { code: 460, description: "Failed" },
      }),
      closeOnlineSession: async () => {},
      sendOnlineInvoice: async () => ({}),
    },
    { request: async () => "<upo/>" },
  );

  await assert.rejects(
    () => handle.waitForUpo({ pollIntervalMs: 0, maxAttempts: 1 }),
    /Session failed: 460 Failed$/,
  );
});

test("OnlineSessionHandle waitForUpoParsed parses XML when UPO is available", async () => {
  const handle = new OnlineSessionHandle(
    "SESSION-REF-PARSED",
    { cipherKey: Buffer.alloc(32), cipherIv: Buffer.alloc(16), encryptionInfo: {} },
    {
      getSessionStatus: async () => ({
        status: { code: 200, description: "Done" },
        upo: { pages: [{ downloadUrl: "https://download/upo.xml" }] },
      }),
      closeOnlineSession: async () => {},
      sendOnlineInvoice: async () => ({}),
    },
    {
      request: async () =>
        "<Potwierdzenie><NazwaPodmiotuPrzyjmujacego>KSeF</NazwaPodmiotuPrzyjmujacego><NumerReferencyjnySesji>REF</NumerReferencyjnySesji><Uwierzytelnienie><IdKontekstu><Nip>1111111111</Nip></IdKontekstu><NumerReferencyjnyTokenaKSeF>TOKEN-1</NumerReferencyjnyTokenaKSeF></Uwierzytelnienie><NazwaStrukturyLogicznej>FA (3)</NazwaStrukturyLogicznej><KodFormularza>FA (3)</KodFormularza><WariantFormularza>1</WariantFormularza><DataWytworzeniaUPO>2026-01-01T00:00:00Z</DataWytworzeniaUPO><Dokument><NipSprzedawcy>1111111111</NipSprzedawcy><NumerKSeFDokumentu>KSEF-1</NumerKSeFDokumentu><NumerFaktury>FV/1</NumerFaktury><DataWystawieniaFaktury>2026-01-01</DataWystawieniaFaktury><DataPrzeslaniaDokumentu>2026-01-01T00:00:00Z</DataPrzeslaniaDokumentu><DataNadaniaNumeruKSeF>2026-01-01T00:00:01Z</DataNadaniaNumeruKSeF><SkrotDokumentu>ABC</SkrotDokumentu><TrybWysylki>Online</TrybWysylki></Dokument></Potwierdzenie>",
    },
  );

  const parsed = await handle.waitForUpoParsed({ pollIntervalMs: 0, maxAttempts: 1 });
  assert.equal(parsed?.numerReferencyjnySesji, "REF");
});

test("OnlineSessionWorkflow throws when symmetric encryption certificate is missing", async () => {
  const workflow = new OnlineSessionWorkflow(
    {
      openOnlineSession: async () => ({ referenceNumber: "SESSION-REF-FAIL" }),
    },
    {
      getPublicKeyCertificates: async () => [{ usage: ["KsefTokenEncryption"], certificate: "CERT" }],
    },
    { request: async () => "<upo/>" },
  );

  await assert.rejects(
    () => workflow.open({ formCode: FORM_CODE }),
    /No public certificate found for usage SymmetricKeyEncryption/,
  );
});

test("OnlineSessionHandle waitForUpo uses defaults and handles missing status payload", async () => {
  const successHandle = new OnlineSessionHandle(
    "SESSION-REF-DEFAULTS",
    { cipherKey: Buffer.alloc(32), cipherIv: Buffer.alloc(16), encryptionInfo: {} },
    {
      getSessionStatus: async () => ({
        status: { code: 200, description: "Done" },
        upo: { pages: [{ downloadUrl: "https://download/default-upo.xml" }] },
      }),
      closeOnlineSession: async () => {},
      sendOnlineInvoice: async () => ({}),
    },
    {
      request: async () => "<upo-default/>",
    },
  );
  assert.equal(await successHandle.waitForUpo(), "<upo-default/>");

  const missingStatusHandle = new OnlineSessionHandle(
    "SESSION-REF-NOSTATUS",
    { cipherKey: Buffer.alloc(32), cipherIv: Buffer.alloc(16), encryptionInfo: {} },
    {
      getSessionStatus: async () => ({}),
      closeOnlineSession: async () => {},
      sendOnlineInvoice: async () => ({}),
    },
    {
      request: async () => "<upo/>",
    },
  );

  await assert.rejects(
    () => missingStatusHandle.waitForUpo({ pollIntervalMs: 0, maxAttempts: 1 }),
    /Session failed: undefined undefined/,
  );
});

test("OnlineSessionWorkflow resume restores handle state and validates encryption data", async () => {
  const workflow = new OnlineSessionWorkflow(
    {
      getSessionStatus: async () => ({ status: { code: 200, description: "Done" } }),
      getSessionInvoiceStatus: async (_sessionRef, invoiceRef) => ({ invoiceRef }),
      getSessionInvoices: async () => ({ items: [] }),
      getSessionFailedInvoices: async () => ({ items: [] }),
      getSessionInvoiceUpoByReferenceNumber: async () => "<upo/>",
      getSessionInvoiceUpoByKsefNumber: async () => "<upo/>",
      getSessionUpo: async () => "<upo/>",
      closeOnlineSession: async () => {},
      sendOnlineInvoice: async () => ({ referenceNumber: "INV-1" }),
    },
    { getPublicKeyCertificates: async () => [] },
    { request: async () => "<upo/>" },
  );

  const state = {
    referenceNumber: "SESSION-RESUME-1",
    encryptionData: {
      cipherKey: Buffer.alloc(32, 1),
      cipherIv: Buffer.alloc(16, 2),
      encryptionInfo: {},
    },
    upoV43: true,
  };
  const handle = workflow.resume(state);
  assert.equal(handle.referenceNumber, "SESSION-RESUME-1");
  assert.equal(handle.upoV43, true);
  assert.deepEqual(handle.getState().referenceNumber, "SESSION-RESUME-1");
  assert.deepEqual(await handle.getInvoiceStatus("INV-REF"), { invoiceRef: "INV-REF" });

  assert.throws(
    () =>
      workflow.resume({
        referenceNumber: "bad",
        encryptionData: { cipherKey: Buffer.alloc(0), cipherIv: Buffer.alloc(16), encryptionInfo: {} },
      }),
    /requires cipherKey and cipherIv/,
  );

  assert.throws(
    () =>
      workflow.resume({
        referenceNumber: "   ",
        encryptionData: {
          cipherKey: Buffer.alloc(32, 1),
          cipherIv: Buffer.alloc(16, 2),
          encryptionInfo: {},
        },
      }),
    /requires non-empty referenceNumber/,
  );
});

test("OnlineSessionHandle exposes close, status and invoice/upo lookups", async () => {
  const calls = [];
  const sessionsClient = {
    closeOnlineSession: async (ref) => {
      calls.push(["close", ref]);
    },
    getSessionStatus: async (ref) => {
      calls.push(["status", ref]);
      return { status: { code: 200, description: "Done" } };
    },
    getSessionInvoices: async (ref, pageOffset, pageSize, continuationToken) => {
      calls.push(["invoices", ref, pageOffset, pageSize, continuationToken]);
      return { items: [{ id: "inv-1" }] };
    },
    getSessionFailedInvoices: async (ref, pageSize, continuationToken) => {
      calls.push(["failed", ref, pageSize, continuationToken]);
      return { items: [{ id: "failed-1" }] };
    },
    getSessionInvoiceUpoByReferenceNumber: async (ref, invoiceRef) => {
      calls.push(["upoByRef", ref, invoiceRef]);
      return "<upo-by-ref/>";
    },
    getSessionInvoiceUpoByKsefNumber: async (ref, ksefNumber) => {
      calls.push(["upoByKsef", ref, ksefNumber]);
      return "<upo-by-ksef/>";
    },
    getSessionUpo: async (ref, upoRef) => {
      calls.push(["sessionUpo", ref, upoRef]);
      return "<session-upo/>";
    },
  };
  const handle = new OnlineSessionHandle(
    "SESSION-METHODS",
    { cipherKey: Buffer.alloc(32, 1), cipherIv: Buffer.alloc(16, 2), encryptionInfo: {} },
    sessionsClient,
    { request: async () => "<upo/>" },
  );

  await handle.close();
  const status = await handle.status();
  assert.equal(status.status.code, 200);

  const invoices = await handle.listInvoices(1, 5, "cont-token");
  assert.deepEqual(invoices.items, [{ id: "inv-1" }]);

  const failed = await handle.listFailedInvoices(10, "failed-token");
  assert.deepEqual(failed.items, [{ id: "failed-1" }]);

  assert.equal(await handle.getInvoiceUpoByReference("INV-REF-1"), "<upo-by-ref/>");
  assert.equal(await handle.getInvoiceUpoByKsefNumber("KSEF-1"), "<upo-by-ksef/>");
  assert.equal(await handle.getSessionUpo("UPO-REF-1"), "<session-upo/>");

  assert.deepEqual(calls, [
    ["close", "SESSION-METHODS"],
    ["status", "SESSION-METHODS"],
    ["invoices", "SESSION-METHODS", 1, 5, "cont-token"],
    ["failed", "SESSION-METHODS", 10, "failed-token"],
    ["upoByRef", "SESSION-METHODS", "INV-REF-1"],
    ["upoByKsef", "SESSION-METHODS", "KSEF-1"],
    ["sessionUpo", "SESSION-METHODS", "UPO-REF-1"],
  ]);
});
