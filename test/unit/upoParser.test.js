import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseUpoXml } from "../../dist/index.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const workspaceRoot = path.resolve(packageRoot, "..");

const upoExamplesDir = path.join(
  workspaceRoot,
  "ksef-docs",
  "faktury",
  "upo",
  "przyklady",
  "v4-3",
  "kontekst-nip",
);
const upoInvoicePath = path.join(upoExamplesDir, "upo-faktura-kontekst-id-nip.xml");
const upoSessionPath = path.join(upoExamplesDir, "upo-sesja-kontekst-id-nip.xml");
const skipMissingInvoiceFixture = fs.existsSync(upoInvoicePath)
  ? false
  : `Missing fixture: ${upoInvoicePath}`;
const skipMissingSessionFixture = fs.existsSync(upoSessionPath)
  ? false
  : `Missing fixture: ${upoSessionPath}`;

test("parseUpoXml parses invoice UPO", { skip: skipMissingInvoiceFixture }, () => {
  const xml = fs.readFileSync(upoInvoicePath, "utf8");
  const upo = parseUpoXml(xml);

  assert.equal(upo.numerReferencyjnySesji, "36950822-93-9D5A28BFDA-47C899773E-5C");
  assert.equal(upo.kodFormularza, "FA (3)");
  assert.equal(upo.dokumenty.length, 1);
  assert.equal(upo.uwierzytelnienie.idKontekstu.kind, "Nip");
  assert.equal(upo.uwierzytelnienie.idKontekstu.nip, "5265877635");
  assert.ok(upo.dokumenty[0]?.numerKSeFDokumentu.includes("5265877635-"));
});

test(
  "parseUpoXml parses session UPO with multiple documents",
  { skip: skipMissingSessionFixture },
  () => {
    const xml = fs.readFileSync(upoSessionPath, "utf8");
    const upo = parseUpoXml(xml);

    assert.equal(upo.dokumenty.length, 2);
    assert.ok(upo.opisPotwierdzenia);
    assert.equal(upo.opisPotwierdzenia.strona, 1);
    assert.equal(upo.opisPotwierdzenia.calkowitaLiczbaDokumentow, 2);
  },
);
