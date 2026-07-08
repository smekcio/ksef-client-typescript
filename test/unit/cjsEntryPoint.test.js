import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const distCjs = path.resolve(__dirname, "../../dist/index.cjs");
const fixtures = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "fixtures", "xades-fixtures.json"), "utf8"),
);

const authTokenRequestXmlOptions = {
  challenge: "20250625-CR-20F5EE4000-DA48AE4124-46",
  contextIdentifierType: "nip",
  contextIdentifierValue: "5265877635",
};

test("CJS entry point exports XAdES symbols", () => {
  const ksef = require(distCjs);
  assert.equal(typeof ksef.XadesSignatureService, "function");
  assert.equal(typeof ksef.XadesKeyPair, "function");
  assert.equal(typeof ksef.buildAuthTokenRequestXml, "function");
});

test("CJS entry point signs AuthTokenRequest (enveloped) without xml-crypto interop error", () => {
  const { XadesSignatureService, XadesKeyPair, buildAuthTokenRequestXml } = require(distCjs);
  const keyPair = XadesKeyPair.fromPem({
    certificatePem: fixtures.rsaCertPem,
    privateKeyPem: fixtures.rsaKeyPem,
  });
  const xml = buildAuthTokenRequestXml(authTokenRequestXmlOptions);
  const signed = new XadesSignatureService().signXadesEnveloped({ xml, keyPair });
  assert.match(signed, /<ds:Signature\b/);
  assert.match(signed, /<xades:SignedProperties\b/);
});

test("CJS entry point signs AuthTokenRequest (enveloping) without xml-crypto interop error", () => {
  const { XadesSignatureService, XadesKeyPair, buildAuthTokenRequestXml } = require(distCjs);
  const keyPair = XadesKeyPair.fromPem({
    certificatePem: fixtures.rsaCertPem,
    privateKeyPem: fixtures.rsaKeyPem,
  });
  const xml = buildAuthTokenRequestXml(authTokenRequestXmlOptions);
  const signed = new XadesSignatureService().signXadesEnveloping({ xml, keyPair });
  assert.match(signed, /<ds:Signature\b/);
  assert.match(signed, /<xades:SignedProperties\b/);
});
