import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BatchSessionHandle,
  BatchSessionWorkflow,
  CryptographyService,
  KsefError,
  KsefValidationError,
} from "../../dist/index.js";

const FORM_CODE = { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" };

test("BatchSessionWorkflow validates required formCode", async () => {
  const workflow = new BatchSessionWorkflow(
    {},
    { getPublicKeyCertificates: async () => [] },
    { request: async () => ({}) },
  );

  await assert.rejects(
    () => workflow.openUploadAndClose({}),
    (error) => {
      assert.ok(error instanceof KsefValidationError);
      assert.equal(error.message, "formCode is required.");
      return true;
    },
  );
});

test("BatchSessionWorkflow uploads encrypted parts in ordinal order and closes session", async () => {
  const originalGetEncryptionData = CryptographyService.getEncryptionData;
  const originalEncryptAes = CryptographyService.encryptAes256Cbc;
  const originalSha256Base64 = CryptographyService.sha256Base64;
  const openCalls = [];
  const uploadCalls = [];
  const closeCalls = [];

  const sessionsClient = {
    openBatchSession: async (request, upoV43) => {
      openCalls.push({ request, upoV43 });
      return {
        referenceNumber: "BATCH-REF-1",
        partUploadRequests: [
          { ordinalNumber: 3, method: "PUT", url: "https://upload/3", headers: { a: "3" } },
          { ordinalNumber: 1, method: "PUT", url: "https://upload/1", headers: { a: "1" } },
          { ordinalNumber: 2, method: "PUT", url: "https://upload/2", headers: { a: "", b: "2" } },
        ],
      };
    },
    closeBatchSession: async (referenceNumber) => {
      closeCalls.push(referenceNumber);
    },
    getSessionStatus: async () => ({ status: { code: 100, description: "Processing" } }),
  };
  const securityClient = { getPublicKeyCertificates: async () => [] };
  const http = {
    request: async (options) => {
      uploadCalls.push(options);
      return {};
    },
  };
  const workflow = new BatchSessionWorkflow(sessionsClient, securityClient, http);

  CryptographyService.getEncryptionData = () => ({
    cipherKey: Buffer.alloc(32, 1),
    cipherIv: Buffer.alloc(16, 2),
    encryptionInfo: {
      encryptedSymmetricKey: "encrypted-key",
      initializationVector: "iv-base64",
    },
  });
  CryptographyService.encryptAes256Cbc = (part) =>
    Buffer.from(`enc:${Buffer.from(part).toString("base64")}`, "utf8");
  CryptographyService.sha256Base64 = (value) => `sha:${Buffer.from(value).length}`;

  try {
    const handle = await workflow.openUploadAndClose({
      formCode: FORM_CODE,
      zipBytes: Buffer.from("0123456789ab", "utf8"),
      maxPartSizeBytes: 4,
      parallelism: 2,
      offlineMode: true,
      upoV43: true,
      publicCertificateBase64Der: "CERT",
    });

    assert.ok(handle instanceof BatchSessionHandle);
    assert.equal(handle.referenceNumber, "BATCH-REF-1");
    assert.equal(openCalls[0].upoV43, true);
    assert.equal(openCalls[0].request.formCode, FORM_CODE);
    assert.equal(openCalls[0].request.offlineMode, true);
    assert.equal(openCalls[0].request.batchFile.fileParts.length, 3);

    assert.deepEqual(
      uploadCalls.map((call) => [call.method, call.path]),
      [
        ["PUT", "https://upload/1"],
        ["PUT", "https://upload/2"],
        ["PUT", "https://upload/3"],
      ],
    );
    assert.deepEqual(uploadCalls[0].headers, { a: "1" });
    assert.deepEqual(uploadCalls[1].headers, { b: "2" });
    assert.deepEqual(uploadCalls[2].headers, { a: "3" });
    assert.deepEqual(closeCalls, ["BATCH-REF-1"]);
  } finally {
    CryptographyService.getEncryptionData = originalGetEncryptionData;
    CryptographyService.encryptAes256Cbc = originalEncryptAes;
    CryptographyService.sha256Base64 = originalSha256Base64;
  }
});

test("BatchSessionWorkflow validates zip source and part count consistency", async () => {
  const originalGetEncryptionData = CryptographyService.getEncryptionData;
  const originalEncryptAes = CryptographyService.encryptAes256Cbc;
  const originalSha256Base64 = CryptographyService.sha256Base64;

  const sessionsClient = {
    openBatchSession: async () => ({
      referenceNumber: "BATCH-REF-2",
      partUploadRequests: [{ ordinalNumber: 1, method: "PUT", url: "https://upload/1" }],
    }),
    closeBatchSession: async () => {},
    getSessionStatus: async () => ({ status: { code: 100, description: "Processing" } }),
  };
  const workflow = new BatchSessionWorkflow(
    sessionsClient,
    { getPublicKeyCertificates: async () => [] },
    { request: async () => ({}) },
  );

  await assert.rejects(
    () =>
      workflow.openUploadAndClose({
        formCode: FORM_CODE,
      }),
    /Either zipBytes or invoices are required\./,
  );

  CryptographyService.getEncryptionData = () => ({
    cipherKey: Buffer.alloc(32, 1),
    cipherIv: Buffer.alloc(16, 2),
    encryptionInfo: { encryptedSymmetricKey: "k", initializationVector: "i" },
  });
  CryptographyService.encryptAes256Cbc = (part) => Buffer.from(part);
  CryptographyService.sha256Base64 = () => "hash";

  try {
    await assert.rejects(
      () =>
        workflow.openUploadAndClose({
          formCode: FORM_CODE,
          zipBytes: Buffer.from("abcdefgh", "utf8"),
          maxPartSizeBytes: 4,
          publicCertificateBase64Der: "CERT",
        }),
      /parts length must match partUploadRequests length\./,
    );
  } finally {
    CryptographyService.getEncryptionData = originalGetEncryptionData;
    CryptographyService.encryptAes256Cbc = originalEncryptAes;
    CryptographyService.sha256Base64 = originalSha256Base64;
  }
});

test("BatchSessionHandle waitForUpo covers success, failure and timeout branches", async () => {
  const statuses = [
    { status: { code: 100, description: "Processing" } },
    {
      status: { code: 200, description: "Done" },
      upo: { pages: [{ downloadUrl: "https://download/upo.xml" }] },
    },
  ];
  const handle = new BatchSessionHandle(
    "BATCH-REF-3",
    { cipherKey: Buffer.alloc(32), cipherIv: Buffer.alloc(16), encryptionInfo: {} },
    {
      getSessionStatus: async () => statuses.shift(),
    },
    {
      request: async () => "<upo-success/>",
    },
  );

  assert.equal(await handle.waitForUpo({ pollIntervalMs: 0, maxAttempts: 3 }), "<upo-success/>");

  const failedHandle = new BatchSessionHandle(
    "BATCH-REF-4",
    { cipherKey: Buffer.alloc(32), cipherIv: Buffer.alloc(16), encryptionInfo: {} },
    {
      getSessionStatus: async () => ({
        status: { code: 500, description: "Failed", details: ["upload-error"] },
      }),
    },
    { request: async () => "<upo/>" },
  );
  await assert.rejects(
    () => failedHandle.waitForUpo({ pollIntervalMs: 0, maxAttempts: 1 }),
    (error) => {
      assert.ok(error instanceof KsefError);
      assert.equal(error.message, "Session failed: 500 Failed Details: upload-error");
      return true;
    },
  );

  const timeoutHandle = new BatchSessionHandle(
    "BATCH-REF-5",
    { cipherKey: Buffer.alloc(32), cipherIv: Buffer.alloc(16), encryptionInfo: {} },
    {
      getSessionStatus: async () => ({
        status: { code: 100, description: "Processing" },
      }),
    },
    { request: async () => "<upo/>" },
  );
  assert.equal(
    await timeoutHandle.waitForUpoParsed({ pollIntervalMs: 0, maxAttempts: 1 }),
    null,
  );

  const failedWithoutDetails = new BatchSessionHandle(
    "BATCH-REF-6",
    { cipherKey: Buffer.alloc(32), cipherIv: Buffer.alloc(16), encryptionInfo: {} },
    {
      getSessionStatus: async () => ({
        status: { code: 500, description: "Failed" },
      }),
    },
    { request: async () => "<upo/>" },
  );
  await assert.rejects(
    () => failedWithoutDetails.waitForUpo({ pollIntervalMs: 0, maxAttempts: 1 }),
    /Session failed: 500 Failed$/,
  );

  const upoXml = `<?xml version="1.0" encoding="utf-8"?>
<Potwierdzenie>
  <NazwaPodmiotuPrzyjmujacego>KSeF</NazwaPodmiotuPrzyjmujacego>
  <NumerReferencyjnySesji>SESSION-1</NumerReferencyjnySesji>
  <Uwierzytelnienie>
    <IdKontekstu><Nip>1111111111</Nip></IdKontekstu>
    <NumerReferencyjnyTokenaKSeF>TOKEN-1</NumerReferencyjnyTokenaKSeF>
  </Uwierzytelnienie>
  <NazwaStrukturyLogicznej>Faktura</NazwaStrukturyLogicznej>
  <KodFormularza>FA (3)</KodFormularza>
  <Dokument>
    <NipSprzedawcy>1111111111</NipSprzedawcy>
    <NumerKSeFDokumentu>KSEF-1</NumerKSeFDokumentu>
    <NumerFaktury>FV/1</NumerFaktury>
    <DataWystawieniaFaktury>2026-01-01</DataWystawieniaFaktury>
    <DataPrzeslaniaDokumentu>2026-01-01T00:00:00Z</DataPrzeslaniaDokumentu>
    <DataNadaniaNumeruKSeF>2026-01-01T00:01:00Z</DataNadaniaNumeruKSeF>
    <SkrotDokumentu>HASH</SkrotDokumentu>
    <TrybWysylki>Online</TrybWysylki>
  </Dokument>
</Potwierdzenie>`;

  const parsedHandle = new BatchSessionHandle(
    "BATCH-REF-7",
    { cipherKey: Buffer.alloc(32), cipherIv: Buffer.alloc(16), encryptionInfo: {} },
    {
      getSessionStatus: async () => ({
        status: { code: 200, description: "Done" },
        upo: { pages: [{ downloadUrl: "https://download/upo.xml" }] },
      }),
    },
    {
      request: async () => upoXml,
    },
  );
  const parsedUpo = await parsedHandle.waitForUpoParsed({ pollIntervalMs: 0, maxAttempts: 1 });
  assert.equal(parsedUpo?.kodFormularza, "FA (3)");
});

test("BatchSessionWorkflow builds zip from invoices and resolves certificate by usage", async () => {
  const originalGetEncryptionData = CryptographyService.getEncryptionData;
  const originalEncryptAes = CryptographyService.encryptAes256Cbc;
  const originalSha256Base64 = CryptographyService.sha256Base64;

  const openCalls = [];
  const sessionsClient = {
    openBatchSession: async (payload) => {
      openCalls.push(payload);
      return {
        referenceNumber: "BATCH-REF-INVOICES",
        partUploadRequests: [{ ordinalNumber: 1, method: "PUT", url: "https://upload/1" }],
      };
    },
    closeBatchSession: async () => {},
    getSessionStatus: async () => ({ status: { code: 100, description: "Processing" } }),
  };
  const securityClient = {
    getPublicKeyCertificates: async () => [
      { usage: ["SymmetricKeyEncryption"], certificate: "CERT-FROM-SECURITY" },
    ],
  };
  const uploads = [];
  const http = {
    request: async (options) => {
      uploads.push(options);
      return {};
    },
  };
  const workflow = new BatchSessionWorkflow(sessionsClient, securityClient, http);

  CryptographyService.getEncryptionData = () => ({
    cipherKey: Buffer.alloc(32, 1),
    cipherIv: Buffer.alloc(16, 2),
    encryptionInfo: { encryptedSymmetricKey: "k", initializationVector: "i" },
  });
  CryptographyService.encryptAes256Cbc = (part) => Buffer.from(part);
  CryptographyService.sha256Base64 = () => "hash";

  try {
    await workflow.openUploadAndClose({
      formCode: FORM_CODE,
      invoices: [{ fileName: "inv.xml", invoice: "<Invoice/>" }],
      parallelism: 1,
    });
    assert.equal(openCalls.length, 1);
    assert.equal(openCalls[0].batchFile.fileParts.length, 1);
    assert.equal(uploads.length, 1);

    const failingWorkflow = new BatchSessionWorkflow(
      sessionsClient,
      { getPublicKeyCertificates: async () => [{ usage: ["Other"], certificate: "X" }] },
      http,
    );
    await assert.rejects(
      () =>
        failingWorkflow.openUploadAndClose({
          formCode: FORM_CODE,
          invoices: [{ fileName: "inv.xml", invoice: "<Invoice/>" }],
        }),
      /No public certificate found for usage SymmetricKeyEncryption/,
    );
  } finally {
    CryptographyService.getEncryptionData = originalGetEncryptionData;
    CryptographyService.encryptAes256Cbc = originalEncryptAes;
    CryptographyService.sha256Base64 = originalSha256Base64;
  }
});

test("BatchSessionHandle waitForUpo defaults and missing status branches", async () => {
  const successHandle = new BatchSessionHandle(
    "BATCH-REF-DEFAULTS",
    { cipherKey: Buffer.alloc(32), cipherIv: Buffer.alloc(16), encryptionInfo: {} },
    {
      getSessionStatus: async () => ({
        status: { code: 200, description: "Done" },
        upo: { pages: [{ downloadUrl: "https://download/default-upo.xml" }] },
      }),
    },
    {
      request: async () => "<upo-default/>",
    },
  );
  assert.equal(await successHandle.waitForUpo(), "<upo-default/>");

  const missingStatusHandle = new BatchSessionHandle(
    "BATCH-REF-NOSTATUS",
    { cipherKey: Buffer.alloc(32), cipherIv: Buffer.alloc(16), encryptionInfo: {} },
    {
      getSessionStatus: async () => ({}),
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

test("BatchSessionWorkflow reports missing encrypted part when mapped parts array has a hole", async () => {
  const originalGetEncryptionData = CryptographyService.getEncryptionData;
  const originalEncryptAes = CryptographyService.encryptAes256Cbc;
  const originalSha256Base64 = CryptographyService.sha256Base64;
  const originalMap = Array.prototype.map;

  const sessionsClient = {
    openBatchSession: async () => ({
      referenceNumber: "BATCH-REF-HOLE",
      partUploadRequests: [{ ordinalNumber: 1, method: "PUT", url: "https://upload/1" }],
    }),
    closeBatchSession: async () => {},
    getSessionStatus: async () => ({ status: { code: 100, description: "Processing" } }),
  };
  const workflow = new BatchSessionWorkflow(
    sessionsClient,
    { getPublicKeyCertificates: async () => [] },
    { request: async () => ({}) },
  );

  CryptographyService.getEncryptionData = () => ({
    cipherKey: Buffer.alloc(32, 1),
    cipherIv: Buffer.alloc(16, 2),
    encryptionInfo: { encryptedSymmetricKey: "k", initializationVector: "i" },
  });
  CryptographyService.encryptAes256Cbc = (part) => Buffer.from(part);
  CryptographyService.sha256Base64 = () => "hash";
  Array.prototype.map = function patchedMap(callback, thisArg) {
    if (this.length === 1 && Buffer.isBuffer(this[0])) {
      return new Array(1);
    }
    return originalMap.call(this, callback, thisArg);
  };

  try {
    await assert.rejects(
      () =>
        workflow.openUploadAndClose({
          formCode: FORM_CODE,
          zipBytes: Buffer.from("abc", "utf8"),
          maxPartSizeBytes: 10,
          publicCertificateBase64Der: "CERT",
        }),
      /Missing batch part at index 0/,
    );
  } finally {
    Array.prototype.map = originalMap;
    CryptographyService.getEncryptionData = originalGetEncryptionData;
    CryptographyService.encryptAes256Cbc = originalEncryptAes;
    CryptographyService.sha256Base64 = originalSha256Base64;
  }
});

test("BatchSessionWorkflow open/resume flows expose state and enforce zip identity", async () => {
  const originalGetEncryptionData = CryptographyService.getEncryptionData;
  const originalEncryptAes = CryptographyService.encryptAes256Cbc;
  const originalSha256Base64 = CryptographyService.sha256Base64;

  const uploaded = [];
  const sessionsClient = {
    openBatchSession: async () => ({
      referenceNumber: "BATCH-RESUME-1",
      partUploadRequests: [{ ordinalNumber: 1, method: "PUT", url: "https://upload/1", headers: {} }],
    }),
    closeBatchSession: async () => {},
    getSessionStatus: async () => ({ status: { code: 100, description: "Processing" } }),
    getSessionFailedInvoices: async () => ({ items: [] }),
  };
  const workflow = new BatchSessionWorkflow(
    sessionsClient,
    { getPublicKeyCertificates: async () => [{ usage: ["SymmetricKeyEncryption"], certificate: "CERT" }] },
    { request: async (options) => uploaded.push(options) },
  );

  CryptographyService.getEncryptionData = () => ({
    cipherKey: Buffer.alloc(32, 1),
    cipherIv: Buffer.alloc(16, 2),
    encryptionInfo: { encryptedSymmetricKey: "k", initializationVector: "i" },
  });
  CryptographyService.encryptAes256Cbc = (part) => Buffer.from(part);
  CryptographyService.sha256Base64 = (value) => `sha:${Buffer.from(value).length}`;

  try {
    const handle = await workflow.open({
      formCode: FORM_CODE,
      zipBytes: Buffer.from("abc", "utf8"),
      maxPartSizeBytes: 10,
      upoV43: true,
    });
    await handle.uploadParts(1);
    const state = handle.getState();
    assert.equal(state.referenceNumber, "BATCH-RESUME-1");
    assert.equal(state.upoV43, true);
    assert.equal(uploaded.length, 1);

    const resumed = await workflow.resume(state, { zipBytes: Buffer.from("abc", "utf8") });
    assert.equal(resumed.referenceNumber, "BATCH-RESUME-1");

    await assert.rejects(
      () => workflow.resume(state, { zipBytes: Buffer.from("abcd", "utf8") }),
      /hash does not match saved state|size does not match saved state/,
    );
  } finally {
    CryptographyService.getEncryptionData = originalGetEncryptionData;
    CryptographyService.encryptAes256Cbc = originalEncryptAes;
    CryptographyService.sha256Base64 = originalSha256Base64;
  }
});
