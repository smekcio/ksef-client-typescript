import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { KsefValidationError, OfflineInvoiceWorkflow } from "../../dist/index.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const workspaceRoot = path.resolve(packageRoot, "..");
const upoInvoicePath = path.join(
  workspaceRoot,
  "ksef-docs",
  "faktury",
  "upo",
  "przyklady",
  "v4-3",
  "kontekst-nip",
  "upo-faktura-kontekst-id-nip.xml",
);
const skipMissingUpoFixture = fs.existsSync(upoInvoicePath)
  ? false
  : `Missing fixture: ${upoInvoicePath}`;

const FORM_CODE = { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" };

test("sendOfflineInvoice sends invoice with offlineMode=true and closes session", async () => {
  let openOptions;
  let sendOptions;
  let closeCalls = 0;
  let waitForUpoCalls = 0;

  const session = {
    referenceNumber: "SESSION-REF-1",
    sendInvoice: async (options) => {
      sendOptions = options;
      return { referenceNumber: "INVOICE-REF-1" };
    },
    close: async () => {
      closeCalls += 1;
    },
    waitForUpo: async () => {
      waitForUpoCalls += 1;
      return null;
    },
  };
  const onlineWorkflow = {
    open: async (options) => {
      openOptions = options;
      return session;
    },
  };
  const workflow = new OfflineInvoiceWorkflow(onlineWorkflow);

  const result = await workflow.sendOfflineInvoice({
    formCode: FORM_CODE,
    invoice: "<Faktura>...</Faktura>",
    waitForUpo: false,
  });

  assert.deepEqual(openOptions, { formCode: FORM_CODE });
  assert.equal(sendOptions.offlineMode, true);
  assert.equal(sendOptions.hashOfCorrectedInvoice, undefined);
  assert.equal(closeCalls, 1);
  assert.equal(waitForUpoCalls, 0);
  assert.equal(result.sessionReferenceNumber, "SESSION-REF-1");
  assert.equal(result.invoiceReferenceNumber, "INVOICE-REF-1");
  assert.equal(result.upoXml, null);
  assert.equal(result.upo, null);
});

test(
  "sendOfflineTechnicalCorrection passes hash and parses UPO",
  { skip: skipMissingUpoFixture },
  async () => {
    const upoXml = fs.readFileSync(upoInvoicePath, "utf8");
    let sendOptions;
    let waitOptions;

    const session = {
      referenceNumber: "SESSION-REF-2",
      sendInvoice: async (options) => {
        sendOptions = options;
        return { referenceNumber: "INVOICE-REF-2" };
      },
      close: async () => {},
      waitForUpo: async (options) => {
        waitOptions = options;
        return upoXml;
      },
    };
    const onlineWorkflow = {
      open: async () => session,
    };
    const workflow = new OfflineInvoiceWorkflow(onlineWorkflow);

    const result = await workflow.sendOfflineTechnicalCorrection({
      formCode: FORM_CODE,
      invoice: "<Faktura>...</Faktura>",
      hashOfCorrectedInvoice: "BASE64_SHA256_HASH",
      waitForUpoOptions: { pollIntervalMs: 1000, maxAttempts: 10 },
    });

    assert.equal(sendOptions.offlineMode, true);
    assert.equal(sendOptions.hashOfCorrectedInvoice, "BASE64_SHA256_HASH");
    assert.deepEqual(waitOptions, { pollIntervalMs: 1000, maxAttempts: 10 });
    assert.equal(result.upo?.kodFormularza, "FA (3)");
  },
);

test("sendOfflineTechnicalCorrection validates hashOfCorrectedInvoice", async () => {
  const onlineWorkflow = {
    open: async () => {
      throw new Error("open should not be called");
    },
  };
  const workflow = new OfflineInvoiceWorkflow(onlineWorkflow);

  await assert.rejects(
    async () =>
      await workflow.sendOfflineTechnicalCorrection({
        formCode: FORM_CODE,
        invoice: "<Faktura>...</Faktura>",
        hashOfCorrectedInvoice: "   ",
      }),
    KsefValidationError,
  );
});

test("getProcedureInstructions returns immutable checklist snapshots", () => {
  const workflow = new OfflineInvoiceWorkflow({
    open: async () => {
      throw new Error("Not used in this test");
    },
  });

  const offline24 = workflow.getProcedureInstructions("offline24");
  const list = workflow.listProcedureInstructions();

  assert.equal(offline24.mode, "offline24");
  assert.equal(list.length, 3);
  assert.ok(offline24.operationalSteps.length >= 3);

  offline24.operationalSteps.push("tamper");
  const fresh = workflow.getProcedureInstructions("offline24");
  assert.equal(fresh.operationalSteps.includes("tamper"), false);
});

test("sendOfflineInvoice closes session silently when send fails and forwards optional open flags", async () => {
  let closeCalls = 0;
  let openOptions;
  const sendError = new Error("send failed");

  const session = {
    referenceNumber: "SESSION-REF-ERR",
    sendInvoice: async () => {
      throw sendError;
    },
    close: async () => {
      closeCalls += 1;
      throw new Error("close failed");
    },
    waitForUpo: async () => null,
  };
  const onlineWorkflow = {
    open: async (options) => {
      openOptions = options;
      return session;
    },
  };
  const workflow = new OfflineInvoiceWorkflow(onlineWorkflow);

  await assert.rejects(
    () =>
      workflow.sendOfflineInvoice({
        formCode: FORM_CODE,
        invoice: "<Faktura>...</Faktura>",
        publicCertificateBase64Der: "CERT-DER",
        upoV43: true,
      }),
    /send failed/,
  );

  assert.deepEqual(openOptions, {
    formCode: FORM_CODE,
    publicCertificateBase64Der: "CERT-DER",
    upoV43: true,
  });
  assert.equal(closeCalls, 1);
});

test("sendOfflineInvoice parses inline UPO XML when waiting is enabled", async () => {
  const workflow = new OfflineInvoiceWorkflow({
    open: async () => ({
      referenceNumber: "SESSION-REF-UPOLIVE",
      sendInvoice: async () => ({ referenceNumber: "INVOICE-REF-UPOLIVE" }),
      close: async () => {},
      waitForUpo: async () =>
        "<Potwierdzenie><NazwaPodmiotuPrzyjmujacego>KSeF</NazwaPodmiotuPrzyjmujacego><NumerReferencyjnySesji>REF</NumerReferencyjnySesji><Uwierzytelnienie><IdKontekstu><Nip>1111111111</Nip></IdKontekstu><NumerReferencyjnyTokenaKSeF>TOKEN-1</NumerReferencyjnyTokenaKSeF></Uwierzytelnienie><NazwaStrukturyLogicznej>FA (3)</NazwaStrukturyLogicznej><KodFormularza>FA (3)</KodFormularza><WariantFormularza>1</WariantFormularza><DataWytworzeniaUPO>2026-01-01T00:00:00Z</DataWytworzeniaUPO><Dokument><NipSprzedawcy>1111111111</NipSprzedawcy><NumerKSeFDokumentu>KSEF-1</NumerKSeFDokumentu><NumerFaktury>FV/1</NumerFaktury><DataWystawieniaFaktury>2026-01-01</DataWystawieniaFaktury><DataPrzeslaniaDokumentu>2026-01-01T00:00:00Z</DataPrzeslaniaDokumentu><DataNadaniaNumeruKSeF>2026-01-01T00:00:01Z</DataNadaniaNumeruKSeF><SkrotDokumentu>ABC</SkrotDokumentu><TrybWysylki>Online</TrybWysylki></Dokument></Potwierdzenie>",
    }),
  });

  const result = await workflow.sendOfflineInvoice({
    formCode: FORM_CODE,
    invoice: "<Faktura>...</Faktura>",
  });

  assert.equal(result.upo?.numerReferencyjnySesji, "REF");
});

test("sendOfflineInvoice closeSilently path preserves original send error when close succeeds", async () => {
  const sendError = new Error("send failed");
  let closeCalls = 0;
  const workflow = new OfflineInvoiceWorkflow({
    open: async () => ({
      referenceNumber: "SESSION-REF-CLOSE-SILENT",
      sendInvoice: async () => {
        throw sendError;
      },
      close: async () => {
        closeCalls += 1;
      },
      waitForUpo: async () => null,
    }),
  });

  await assert.rejects(
    () =>
      workflow.sendOfflineInvoice({
        formCode: FORM_CODE,
        invoice: "<Faktura>...</Faktura>",
      }),
    /send failed/,
  );
  assert.equal(closeCalls, 1);
});

test("sendOfflineInvoice handles waitForUpo=true with empty UPO payload", async () => {
  const workflow = new OfflineInvoiceWorkflow({
    open: async () => ({
      referenceNumber: "SESSION-REF-NO-UPO",
      sendInvoice: async () => ({ referenceNumber: "INVOICE-REF-NO-UPO" }),
      close: async () => {},
      waitForUpo: async () => null,
    }),
  });

  const result = await workflow.sendOfflineInvoice({
    formCode: FORM_CODE,
    invoice: "<Faktura>...</Faktura>",
    waitForUpo: true,
  });

  assert.equal(result.upoXml, null);
  assert.equal(result.upo, null);
});
