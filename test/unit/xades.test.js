import assert from "node:assert/strict";
import { test } from "node:test";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DOMParser } from "@xmldom/xmldom";
import xmlCrypto from "xml-crypto";
import xpath from "xpath";
import { buildAuthTokenRequestXml, XadesKeyPair, XadesSignatureService } from "../../dist/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesPath = path.join(__dirname, "..", "fixtures", "xades-fixtures.json");
const fixtures = JSON.parse(fs.readFileSync(fixturesPath, "utf8"));

function generateKeyPairAndCertificate({ keyType }) {
  if (keyType === "rsa") {
    return {
      privateKeyPem: fixtures.rsaKeyPem,
      certificatePem: fixtures.rsaCertPem,
    };
  }
  if (keyType === "ec") {
    return {
      privateKeyPem: fixtures.ecKeyPem,
      certificatePem: fixtures.ecCertPem,
    };
  }
  throw new Error(`unsupported keyType: ${keyType}`);
}

function verifySignedXml(signedXml, certificatePem) {
  const { SignedXml } = xmlCrypto;
  const doc = new DOMParser().parseFromString(signedXml, "application/xml");
  const signature = xpath.select1(
    "//*[local-name(.)='Signature' and namespace-uri(.)='http://www.w3.org/2000/09/xmldsig#']",
    doc,
  );
  assert.ok(signature, "Signature node not found");

  const verifier = new SignedXml({ publicCert: certificatePem });
  verifier.loadSignature(signature);

  const ecdsaUri = "http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256";
  if (verifier.signatureAlgorithm === ecdsaUri && !verifier.SignatureAlgorithms?.[ecdsaUri]) {
    verifier.SignatureAlgorithms = {
      ...(verifier.SignatureAlgorithms ?? {}),
      [ecdsaUri]: class EcdsaSha256 {
        getSignature(signedInfo, privateKey) {
          const signer = crypto.createSign("SHA256");
          signer.update(signedInfo);
          return signer.sign({ key: privateKey, dsaEncoding: "der" }, "base64");
        }

        verifySignature(material, key, signatureValue) {
          const v = crypto.createVerify("SHA256");
          v.update(material);
          return v.verify(key, signatureValue, "base64");
        }

        getAlgorithmName() {
          return ecdsaUri;
        }
      },
    };
  }

  return verifier.checkSignature(signedXml);
}

test("XAdES RSA: signs AuthTokenRequest and verifies locally", () => {
  const { certificatePem, privateKeyPem } = generateKeyPairAndCertificate({ keyType: "rsa" });
  const keyPair = XadesKeyPair.fromPem({ certificatePem, privateKeyPem });

  const xml = buildAuthTokenRequestXml({
    challenge: "20250625-CR-20F5EE4000-DA48AE4124-46",
    contextIdentifierType: "nip",
    contextIdentifierValue: "5265877635",
  });

  const service = new XadesSignatureService();
  const signedXml = service.signXadesEnveloped({ xml, keyPair });

  assert.match(
    signedXml,
    /Type="http:\/\/uri\.etsi\.org\/01903#SignedProperties"/,
    "SignedProperties reference must include Type",
  );
  assert.match(signedXml, /<xades:QualifyingProperties\b/, "QualifyingProperties missing");
  assert.match(signedXml, /<xades:SignedProperties\b/, "SignedProperties missing");
  assert.match(
    signedXml,
    /SignatureMethod Algorithm="http:\/\/www\.w3\.org\/2001\/04\/xmldsig-more#rsa-sha256"/,
    "RSA signature method mismatch",
  );

  assert.equal(verifySignedXml(signedXml, certificatePem), true);
});

test("XAdES RSA (enveloping): signs AuthTokenRequest and verifies locally", () => {
  const { certificatePem, privateKeyPem } = generateKeyPairAndCertificate({ keyType: "rsa" });
  const keyPair = XadesKeyPair.fromPem({ certificatePem, privateKeyPem });

  const xml = buildAuthTokenRequestXml({
    challenge: "20250625-CR-20F5EE4000-DA48AE4124-46",
    contextIdentifierType: "nip",
    contextIdentifierValue: "5265877635",
  });

  const service = new XadesSignatureService();
  const signedXml = service.signXadesEnveloping({ xml, keyPair });

  assert.match(
    signedXml,
    /Type="http:\/\/uri\.etsi\.org\/01903#SignedProperties"/,
    "SignedProperties reference must include Type",
  );
  assert.match(signedXml, /<ds:Signature\b/, "Signature root missing");
  assert.match(signedXml, /<ds:Object\b/, "Object missing");
  assert.match(signedXml, /<xades:QualifyingProperties\b/, "QualifyingProperties missing");

  assert.equal(verifySignedXml(signedXml, certificatePem), true);
});

test("XAdES ECDSA: signs AuthTokenRequest and verifies locally", () => {
  const { certificatePem, privateKeyPem } = generateKeyPairAndCertificate({ keyType: "ec" });
  const keyPair = XadesKeyPair.fromPem({ certificatePem, privateKeyPem });

  const xml = buildAuthTokenRequestXml({
    challenge: "20250625-CR-20F5EE4000-DA48AE4124-46",
    contextIdentifierType: "nip",
    contextIdentifierValue: "5265877635",
  });

  const service = new XadesSignatureService();
  const signedXml = service.signXadesEnveloped({ xml, keyPair });

  assert.match(
    signedXml,
    /SignatureMethod Algorithm="http:\/\/www\.w3\.org\/2001\/04\/xmldsig-more#ecdsa-sha256"/,
    "ECDSA signature method mismatch",
  );

  assert.equal(verifySignedXml(signedXml, certificatePem), true);
});

test("XAdES ECDSA (enveloping): signs AuthTokenRequest and verifies locally", () => {
  const { certificatePem, privateKeyPem } = generateKeyPairAndCertificate({ keyType: "ec" });
  const keyPair = XadesKeyPair.fromPem({ certificatePem, privateKeyPem });

  const xml = buildAuthTokenRequestXml({
    challenge: "20250625-CR-20F5EE4000-DA48AE4124-46",
    contextIdentifierType: "nip",
    contextIdentifierValue: "5265877635",
  });

  const service = new XadesSignatureService();
  const signedXml = service.signXadesEnveloping({ xml, keyPair });

  assert.match(
    signedXml,
    /SignatureMethod Algorithm="http:\/\/www\.w3\.org\/2001\/04\/xmldsig-more#ecdsa-sha256"/,
    "ECDSA signature method mismatch",
  );

  assert.equal(verifySignedXml(signedXml, certificatePem), true);
});
