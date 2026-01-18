import assert from "node:assert/strict";
import { test } from "node:test";
import crypto from "node:crypto";
import childProcess from "node:child_process";
import { DOMParser } from "@xmldom/xmldom";
import xmlCrypto from "xml-crypto";
import xpath from "xpath";
import { buildAuthTokenRequestXml, XadesKeyPair, XadesSignatureService } from "../../dist/index.js";

function generateKeyPairAndCertificate({ keyType }) {
  const python = `
import json
from datetime import datetime, timedelta, timezone

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa, ec
from cryptography.x509.oid import NameOID

key_type = ${JSON.stringify(keyType)}

if key_type == "rsa":
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
elif key_type == "ec":
    key = ec.generate_private_key(ec.SECP256R1())
else:
    raise SystemExit("unsupported key_type")

subject = issuer = x509.Name([
    x509.NameAttribute(NameOID.COMMON_NAME, "Test"),
    x509.NameAttribute(NameOID.ORGANIZATION_NAME, "KSeF"),
    x509.NameAttribute(NameOID.COUNTRY_NAME, "PL"),
])
now = datetime.now(timezone.utc)
cert = (
    x509.CertificateBuilder()
    .subject_name(subject)
    .issuer_name(issuer)
    .public_key(key.public_key())
    .serial_number(x509.random_serial_number())
    .not_valid_before(now - timedelta(days=1))
    .not_valid_after(now + timedelta(days=1))
    .sign(key, hashes.SHA256())
)

key_pem = key.private_bytes(
    encoding=serialization.Encoding.PEM,
    format=serialization.PrivateFormat.PKCS8,
    encryption_algorithm=serialization.NoEncryption(),
).decode("ascii")

cert_pem = cert.public_bytes(serialization.Encoding.PEM).decode("ascii")

print(json.dumps({"privateKeyPem": key_pem, "certificatePem": cert_pem}))
`.trim();

  const out = childProcess.execFileSync("python", ["-c", python], { encoding: "utf8" });
  return JSON.parse(out);
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
