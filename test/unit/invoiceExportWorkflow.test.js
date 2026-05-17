import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  createZip,
  CryptographyService,
  InvoiceExportWorkflow,
  KsefError,
  KsefValidationError,
} from "../../dist/index.js";

const fixturesPath = path.resolve(process.cwd(), "test", "fixtures", "xades-fixtures.json");
const fixtures = JSON.parse(fs.readFileSync(fixturesPath, "utf8"));

function certPemToBase64Der(certPem) {
  return certPem.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s+/g, "");
}

function buildExportStatus(parts, status = { code: 200, description: "ok" }) {
  return {
    status,
    package: {
      invoiceCount: 1,
      size: parts.reduce((sum, part) => sum + part.encryptedPartSize, 0),
      parts,
      isTruncated: false,
    },
  };
}

test("InvoiceExportWorkflow.startExport uses provided encryption data", async () => {
  const calls = [];
  const invoicesClient = {
    exportInvoices: async (request) => {
      calls.push(request);
      return { referenceNumber: "EXP-REF-1" };
    },
  };
  const securityClient = {
    getPublicKeyCertificates: async () => {
      throw new Error("should not be called");
    },
  };
  const workflow = new InvoiceExportWorkflow(invoicesClient, securityClient, {});

  const encryptionData = {
    cipherKey: Buffer.alloc(32, 1),
    cipherIv: Buffer.alloc(16, 2),
    encryptionInfo: {
      encryptedSymmetricKey: "abc",
      initializationVector: "def",
    },
  };
  const filters = {
    subjectType: "Subject1",
    dateRange: {
      dateType: "Issue",
      from: "2025-01-01",
      to: "2025-01-02",
    },
  };

  const result = await workflow.startExport({
    filters,
    encryptionData,
  });

  assert.equal(result.referenceNumber, "EXP-REF-1");
  assert.deepEqual(result.encryptionData, encryptionData);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    encryption: encryptionData.encryptionInfo,
    filters,
  });
});

test("InvoiceExportWorkflow.startExport passes onlyMetadata to export request", async () => {
  const calls = [];
  const workflow = new InvoiceExportWorkflow(
    {
      exportInvoices: async (request) => {
        calls.push(request);
        return { referenceNumber: "EXP-REF-ONLY-METADATA" };
      },
    },
    {
      getPublicKeyCertificates: async () => {
        throw new Error("should not be called");
      },
    },
    {},
  );

  const encryptionData = {
    cipherKey: Buffer.alloc(32, 1),
    cipherIv: Buffer.alloc(16, 2),
    encryptionInfo: {
      encryptedSymmetricKey: "abc",
      initializationVector: "def",
    },
  };

  const result = await workflow.startExport({
    filters: {
      subjectType: "Subject1",
      dateRange: {
        dateType: "Issue",
        from: "2025-01-01",
        to: "2025-01-02",
      },
    },
    encryptionData,
    onlyMetadata: true,
  });

  assert.equal(result.referenceNumber, "EXP-REF-ONLY-METADATA");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].onlyMetadata, true);
});

test("InvoiceExportWorkflow.startExport maps legacy includeMetadata to onlyMetadata", async () => {
  const calls = [];
  const workflow = new InvoiceExportWorkflow(
    {
      exportInvoices: async (request) => {
        calls.push(request);
        return { referenceNumber: "EXP-REF-INCLUDE-METADATA" };
      },
    },
    {
      getPublicKeyCertificates: async () => {
        throw new Error("should not be called");
      },
    },
    {},
  );

  const encryptionData = {
    cipherKey: Buffer.alloc(32, 1),
    cipherIv: Buffer.alloc(16, 2),
    encryptionInfo: {
      encryptedSymmetricKey: "abc",
      initializationVector: "def",
    },
  };

  const result = await workflow.startExport({
    filters: {
      subjectType: "Subject1",
      dateRange: {
        dateType: "Issue",
        from: "2025-01-01",
        to: "2025-01-02",
      },
    },
    encryptionData,
    includeMetadata: false,
  });

  assert.equal(result.referenceNumber, "EXP-REF-INCLUDE-METADATA");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].onlyMetadata, false);
  assert.equal(calls[0].includeMetadata, undefined);
});

test("InvoiceExportWorkflow.startExport builds encryption data from security certificate", async () => {
  const certBase64Der = certPemToBase64Der(fixtures.rsaCertPem);

  const invoicesClient = {
    exportInvoices: async () => ({ referenceNumber: "EXP-REF-2" }),
  };
  const securityClient = {
    getPublicKeyCertificates: async () => [
      {
        usage: ["SymmetricKeyEncryption"],
        certificate: certBase64Der,
      },
    ],
  };
  const workflow = new InvoiceExportWorkflow(invoicesClient, securityClient, {});

  const result = await workflow.startExport({
    filters: {
      subjectType: "Subject1",
      dateRange: {
        dateType: "Issue",
        from: "2025-01-01",
        to: "2025-01-02",
      },
    },
  });

  assert.equal(result.referenceNumber, "EXP-REF-2");
  assert.equal(result.encryptionData.cipherKey.length, 32);
  assert.equal(result.encryptionData.cipherIv.length, 16);
});

test("InvoiceExportWorkflow.startExport validates filters", async () => {
  const workflow = new InvoiceExportWorkflow(
    { exportInvoices: async () => ({ referenceNumber: "EXP-REF" }) },
    {},
    {},
  );

  await assert.rejects(
    () =>
      workflow.startExport({
        filters: {
          subjectType: "",
          dateRange: {
            dateType: "Issue",
            from: "2025-01-01",
            to: "2025-01-02",
          },
        },
      }),
    KsefValidationError,
  );
});

test("InvoiceExportWorkflow.waitForExport supports success, failure and timeout", async () => {
  let attempts = 0;
  const invoicesClient = {
    getInvoiceExportStatus: async () => {
      attempts += 1;
      if (attempts === 1) {
        return { status: { code: 100, description: "InProgress" } };
      }
      return { status: { code: 200, description: "Done" } };
    },
  };
  const workflow = new InvoiceExportWorkflow(invoicesClient, {}, {});

  const done = await workflow.waitForExport("EXP-REF", { pollIntervalMs: 1, maxAttempts: 3 });
  assert.equal(done.status.code, 200);

  const failedWorkflow = new InvoiceExportWorkflow(
    {
      getInvoiceExportStatus: async () => ({
        status: { code: 460, description: "Failed", details: ["reason-1"] },
      }),
    },
    {},
    {},
  );

  await assert.rejects(
    () => failedWorkflow.waitForExport("EXP-FAIL", { pollIntervalMs: 1, maxAttempts: 1 }),
    (error) => {
      assert.ok(error instanceof KsefError);
      assert.match(error.message, /Export failed: 460 Failed/);
      assert.match(error.message, /reason-1/);
      return true;
    },
  );

  const failedWithoutDetailsWorkflow = new InvoiceExportWorkflow(
    {
      getInvoiceExportStatus: async () => ({
        status: { code: 460, description: "Failed" },
      }),
    },
    {},
    {},
  );
  await assert.rejects(
    () =>
      failedWithoutDetailsWorkflow.waitForExport("EXP-FAIL-NO-DETAILS", {
        pollIntervalMs: 1,
        maxAttempts: 1,
      }),
    /Export failed: 460 Failed$/,
  );

  const timeoutWorkflow = new InvoiceExportWorkflow(
    {
      getInvoiceExportStatus: async () => ({
        status: { code: 100, description: "InProgress" },
      }),
    },
    {},
    {},
  );

  await assert.rejects(
    () => timeoutWorkflow.waitForExport("EXP-TIMEOUT", { pollIntervalMs: 1, maxAttempts: 1 }),
    /did not complete within max attempts/,
  );
});

test("InvoiceExportWorkflow.waitForExport uses default polling options when omitted", async () => {
  const workflow = new InvoiceExportWorkflow(
    {
      getInvoiceExportStatus: async () => ({
        status: { code: 200, description: "Done" },
      }),
    },
    {},
    {},
  );
  const status = await workflow.waitForExport("EXP-DEFAULTS");
  assert.equal(status.status.code, 200);
});

test("InvoiceExportWorkflow.startExport uses explicit certificate and errors on missing usage", async () => {
  const certBase64Der = certPemToBase64Der(fixtures.rsaCertPem);
  const originalGetEncryptionData = CryptographyService.getEncryptionData;
  const encryptionCalls = [];
  CryptographyService.getEncryptionData = (certificate) => {
    encryptionCalls.push(certificate);
    return {
      cipherKey: Buffer.alloc(32, 1),
      cipherIv: Buffer.alloc(16, 2),
      encryptionInfo: {
        encryptedSymmetricKey: "abc",
        initializationVector: "def",
      },
    };
  };

  try {
    const workflow = new InvoiceExportWorkflow(
      {
        exportInvoices: async () => ({ referenceNumber: "EXP-REF-CERT" }),
      },
      {
        getPublicKeyCertificates: async () => [
          { usage: ["KsefTokenEncryption"], certificate: certBase64Der },
        ],
      },
      {},
    );

    await workflow.startExport({
      filters: {
        subjectType: "Subject1",
        dateRange: { dateType: "Issue", from: "2025-01-01", to: "2025-01-01" },
      },
      publicCertificateBase64Der: certBase64Der,
    });
    assert.equal(encryptionCalls[0], certBase64Der);

    await assert.rejects(
      () =>
        workflow.startExport({
          filters: {
            subjectType: "Subject1",
            dateRange: { dateType: "Issue", from: "2025-01-01", to: "2025-01-01" },
          },
        }),
      /No public certificate found for usage SymmetricKeyEncryption/,
    );
  } finally {
    CryptographyService.getEncryptionData = originalGetEncryptionData;
  }
});

test("InvoiceExportWorkflow.downloadAndProcessPackage accepts requireExportPartHash option", async () => {
  const encryptionData = {
    cipherKey: CryptographyService.generateAesKey(),
    cipherIv: CryptographyService.generateIv(),
    encryptionInfo: {},
  };
  const archive = await createZip([
    {
      fileName: "_metadata.json",
      content: Buffer.from(JSON.stringify({ invoices: [] }), "utf8"),
    },
  ]);
  const encryptedArchive = CryptographyService.encryptAes256Cbc(
    archive,
    encryptionData.cipherKey,
    encryptionData.cipherIv,
  );

  const workflow = new InvoiceExportWorkflow(
    {},
    {},
    {
      request: async () => encryptedArchive,
    },
    {
      requireExportPartHash: true,
    },
  );

  const result = await workflow.downloadAndProcessPackage(
    buildExportStatus([
      {
        ordinalNumber: 1,
        partName: "part-1.bin",
        method: "GET",
        url: "https://uploads.example.com/part-1.bin",
        partSize: archive.length,
        partHash: "",
        encryptedPartSize: encryptedArchive.length,
        encryptedPartHash: "",
        expirationDate: "2099-01-01T00:00:00Z",
      },
    ]),
    encryptionData,
    { requireExportPartHash: false },
  );

  assert.deepEqual(result.metadataSummaries, []);
  assert.deepEqual(result.invoiceXmlFiles, {});
});

test("InvoiceExportWorkflow.downloadAndProcessPackage decrypts archive and extracts metadata+xml", async () => {
  const encryptionData = {
    cipherKey: CryptographyService.generateAesKey(),
    cipherIv: CryptographyService.generateIv(),
  };

  const archive = await createZip([
    {
      fileName: "_metadata.json",
      content: Buffer.from(JSON.stringify({ invoices: [{ ksefNumber: "KSEF-1" }] }), "utf8"),
    },
    {
      fileName: "invoice-1.xml",
      content: Buffer.from("<Invoice id=\"1\" />", "utf8"),
    },
    {
      fileName: "readme.txt",
      content: Buffer.from("ignored", "utf8"),
    },
  ]);

  const encryptedArchive = CryptographyService.encryptAes256Cbc(
    archive,
    encryptionData.cipherKey,
    encryptionData.cipherIv,
  );
  const encryptedPartHash = CryptographyService.sha256Base64(encryptedArchive);

  const http = {
    request: async () => encryptedArchive,
  };
  const workflow = new InvoiceExportWorkflow({}, {}, http);
  const status = buildExportStatus([
    {
      ordinalNumber: 1,
      partName: "part-1.bin",
      method: "GET",
      url: "https://uploads.example.com/part-1.bin",
      partSize: archive.length,
      partHash: "unused",
      encryptedPartSize: encryptedArchive.length,
      encryptedPartHash,
      expirationDate: "2099-01-01T00:00:00Z",
    },
  ]);

  const processed = await workflow.downloadAndProcessPackage(status, encryptionData);

  assert.deepEqual(processed.metadataSummaries, [{ ksefNumber: "KSEF-1" }]);
  assert.equal(processed.invoiceXmlFiles["invoice-1.xml"], "<Invoice id=\"1\" />");
  assert.equal(processed.invoiceXmlFiles["readme.txt"], undefined);
});

test("InvoiceExportWorkflow.waitForExport uses defaults and handles missing status object", async () => {
  const workflow = new InvoiceExportWorkflow(
    {
      getInvoiceExportStatus: async () => ({}),
    },
    {},
    {},
  );

  await assert.rejects(
    () => workflow.waitForExport("EXP-MISSING-STATUS", { pollIntervalMs: 0, maxAttempts: 1 }),
    /Export failed: undefined undefined/,
  );
});

test("InvoiceExportWorkflow.downloadAndProcessPackage handles missing package and invoiceList metadata key", async () => {
  const encryptionData = {
    cipherKey: CryptographyService.generateAesKey(),
    cipherIv: CryptographyService.generateIv(),
    encryptionInfo: {},
  };
  const archive = await createZip([
    {
      fileName: "_metadata.json",
      content: Buffer.from(JSON.stringify({ invoiceList: [{ KsefNumber: "KSEF-LIST-1" }] }), "utf8"),
    },
  ]);
  const encryptedArchive = CryptographyService.encryptAes256Cbc(
    archive,
    encryptionData.cipherKey,
    encryptionData.cipherIv,
  );

  const workflow = new InvoiceExportWorkflow(
    {},
    {},
    {
      request: async () => encryptedArchive,
    },
    {
      requireExportPartHash: false,
    },
  );

  const processed = await workflow.downloadAndProcessPackage(
    {
      status: { code: 200, description: "ok" },
      package: {
        invoiceCount: 1,
        size: encryptedArchive.length,
        parts: [
          {
            ordinalNumber: 1,
            partName: "part-1.bin",
            method: "GET",
            url: "https://uploads.example.com/part-1.bin",
            partSize: archive.length,
            partHash: "",
            encryptedPartSize: encryptedArchive.length,
            encryptedPartHash: "",
            expirationDate: "2099-01-01T00:00:00Z",
          },
        ],
        isTruncated: false,
      },
    },
    encryptionData,
  );

  assert.deepEqual(processed.metadataSummaries, [{ KsefNumber: "KSEF-LIST-1" }]);
});

test("InvoiceExportWorkflow.downloadAndProcessPackage ignores null metadata payload", async () => {
  const encryptionData = {
    cipherKey: CryptographyService.generateAesKey(),
    cipherIv: CryptographyService.generateIv(),
    encryptionInfo: {},
  };
  const archive = await createZip([
    {
      fileName: "_metadata.json",
      content: Buffer.from("null", "utf8"),
    },
  ]);
  const encryptedArchive = CryptographyService.encryptAes256Cbc(
    archive,
    encryptionData.cipherKey,
    encryptionData.cipherIv,
  );

  const workflow = new InvoiceExportWorkflow(
    {},
    {},
    {
      request: async () => encryptedArchive,
    },
    {
      requireExportPartHash: false,
    },
  );

  const processed = await workflow.downloadAndProcessPackage(
    {
      status: { code: 200, description: "ok" },
      package: {
        invoiceCount: 1,
        size: encryptedArchive.length,
        parts: [
          {
            ordinalNumber: 1,
            partName: "part-1.bin",
            method: "GET",
            url: "https://uploads.example.com/part-1.bin",
            partSize: archive.length,
            partHash: "",
            encryptedPartSize: encryptedArchive.length,
            encryptedPartHash: "",
            expirationDate: "2099-01-01T00:00:00Z",
          },
        ],
        isTruncated: false,
      },
    },
    encryptionData,
  );

  assert.deepEqual(processed.metadataSummaries, []);
});

test("InvoiceExportWorkflow.downloadAndProcessPackage returns empty result when package is missing", async () => {
  const workflow = new InvoiceExportWorkflow(
    {},
    {},
    {
      request: async () => {
        throw new Error("request should not be called");
      },
    },
    {
      requireExportPartHash: false,
    },
  );

  const result = await workflow.downloadAndProcessPackage(
    {
      status: { code: 200, description: "ok" },
    },
    {
      cipherKey: CryptographyService.generateAesKey(),
      cipherIv: CryptographyService.generateIv(),
      encryptionInfo: {},
    },
  );
  assert.deepEqual(result, { metadataSummaries: [], invoiceXmlFiles: {} });
});

test("InvoiceExportWorkflow treats non-string encryptedPartHash as missing when hash verification is required", async () => {
  const encryptionData = {
    cipherKey: CryptographyService.generateAesKey(),
    cipherIv: CryptographyService.generateIv(),
    encryptionInfo: {},
  };
  const archive = await createZip([
    {
      fileName: "_metadata.json",
      content: Buffer.from(JSON.stringify({ invoices: [] }), "utf8"),
    },
  ]);
  const encryptedArchive = CryptographyService.encryptAes256Cbc(
    archive,
    encryptionData.cipherKey,
    encryptionData.cipherIv,
  );
  const workflow = new InvoiceExportWorkflow(
    {},
    {},
    {
      request: async () => encryptedArchive,
    },
    {
      requireExportPartHash: true,
    },
  );

  await assert.rejects(
    () =>
      workflow.downloadAndProcessPackage(
        buildExportStatus([
          {
            ordinalNumber: 1,
            partName: "part-1.bin",
            method: "GET",
            url: "https://uploads.example.com/part-1.bin",
            partSize: archive.length,
            partHash: "",
            encryptedPartSize: encryptedArchive.length,
            encryptedPartHash: 123,
            expirationDate: "2099-01-01T00:00:00Z",
          },
        ]),
        encryptionData,
      ),
    /Missing encrypted part hash/,
  );
});
