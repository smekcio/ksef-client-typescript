import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { test } from "node:test";
import { FA3BatchDraft, FA3Draft, FA3Invoice, KsefError, KsefValidationError } from "../../dist/index.js";

test("FA3 SDK builds XML from typed builder", async () => {
  const draft = FA3Invoice.basic("FV/FA3/1")
    .issueDate("2026-05-17T10:00:00Z")
    .seller({
      name: "Sprzedawca Test",
      taxId: "1111111111",
      addressLine1: "Testowa 1",
    })
    .buyer({
      name: "Nabywca Test",
      taxId: "2222222222",
      addressLine1: "Nabywcy 2",
    })
    .addLine({
      description: "Pozycja 1",
      quantity: 1,
      unit: "szt",
      unitNetPrice: 100,
      vatRate: 23,
    })
    .build();

  const xml = await draft.toXml({ pretty: true });
  assert.match(xml, /<Faktura/);
  assert.match(xml, /<P_2>FV\/FA3\/1<\/P_2>/);
  assert.match(xml, /<FaWiersz>/);
});

test("FA3 SDK validates required data before XML generation", async () => {
  const draft = new FA3Draft({
    invoiceNumber: "",
    issueDate: "",
    seller: { name: "", taxId: "" },
    buyer: { name: "", taxId: "" },
    lines: [],
  });
  const issues = draft.validate();
  assert.ok(issues.length > 0);
  await assert.rejects(() => draft.toXml(), KsefValidationError);
});

test("FA3 SDK batch supports JSON roundtrip and ZIP export", async () => {
  const draft = FA3Invoice.settlement("FV/FA3/BATCH/1")
    .issueDate("2026-05-17T10:00:00Z")
    .seller({ name: "Sprzedawca", taxId: "1111111111" })
    .buyer({ name: "Nabywca", taxId: "2222222222" })
    .addLine({
      description: "Pozycja 1",
      quantity: 2,
      unit: "szt",
      unitNetPrice: 50,
      vatRate: 23,
    })
    .settlementAmount(123)
    .build();
  const batch = new FA3BatchDraft([draft]);
  const json = batch.toJson();
  const loaded = FA3BatchDraft.fromJson(json);

  const dir = await mkdtemp(path.join(os.tmpdir(), "ksef-fa3-"));
  try {
    const files = await loaded.toXmlFiles(dir);
    assert.equal(files.length, 1);
    const xmlContent = await readFile(files[0], "utf8");
    assert.match(xmlContent, /FV\/FA3\/BATCH\/1/);

    const zipPath = path.join(dir, "fa3.zip");
    const writtenZipPath = await loaded.toXmlZip(zipPath);
    assert.equal(writtenZipPath, zipPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("FA3 SDK XSD validation branch is reachable", async () => {
  const draft = FA3Invoice.basic("FV/FA3/XSD/1")
    .issueDate("2026-05-17T10:00:00Z")
    .seller({ name: "Sprzedawca", taxId: "1111111111" })
    .buyer({ name: "Nabywca", taxId: "2222222222" })
    .addLine({
      description: "Pozycja 1",
      quantity: 1,
      unit: "szt",
      unitNetPrice: 100,
      vatRate: 23,
    })
    .build();

  try {
    const xml = await draft.toXml({ xsdValidate: true });
    assert.match(xml, /<Faktura/);
  } catch (error) {
    assert.ok(error instanceof KsefError);
    assert.match(error.message, /libxmljs2|XSD validation failed|Missing FA\(3\) schema/i);
  }
});
