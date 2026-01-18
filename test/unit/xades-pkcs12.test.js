import assert from "node:assert/strict";
import { test } from "node:test";
import childProcess from "node:child_process";
import crypto from "node:crypto";
import { XadesKeyPair } from "../../dist/index.js";

async function hasNodeForge() {
  try {
    await import("node-forge");
    return true;
  } catch {
    return false;
  }
}

function generatePkcs12Bundle() {
  const python = `
import base64
import json
from datetime import datetime, timedelta, timezone

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization.pkcs12 import serialize_key_and_certificates
from cryptography.x509.oid import NameOID

def make_cert(*, subject_cn, issuer_name, issuer_key, public_key, is_ca):
    now = datetime.now(timezone.utc)
    builder = (
        x509.CertificateBuilder()
        .subject_name(x509.Name([
            x509.NameAttribute(NameOID.COMMON_NAME, subject_cn),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "KSeF"),
            x509.NameAttribute(NameOID.COUNTRY_NAME, "PL"),
        ]))
        .issuer_name(issuer_name)
        .public_key(public_key)
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(days=1))
        .not_valid_after(now + timedelta(days=30))
    )
    if is_ca:
        builder = builder.add_extension(
            x509.BasicConstraints(ca=True, path_length=None),
            critical=True,
        )
    return builder.sign(issuer_key, hashes.SHA256())

root_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
root_name = x509.Name([
    x509.NameAttribute(NameOID.COMMON_NAME, "Root"),
    x509.NameAttribute(NameOID.ORGANIZATION_NAME, "KSeF"),
    x509.NameAttribute(NameOID.COUNTRY_NAME, "PL"),
])
root_cert = make_cert(
    subject_cn="Root",
    issuer_name=root_name,
    issuer_key=root_key,
    public_key=root_key.public_key(),
    is_ca=True,
)

leaf_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
leaf_cert = make_cert(
    subject_cn="Leaf",
    issuer_name=root_name,
    issuer_key=root_key,
    public_key=leaf_key.public_key(),
    is_ca=False,
)

p12 = serialize_key_and_certificates(
    name=b"leaf",
    key=leaf_key,
    cert=leaf_cert,
    cas=[root_cert],
    encryption_algorithm=serialization.NoEncryption(),
)

print(json.dumps({
    "pkcs12Base64": base64.b64encode(p12).decode("ascii"),
    "leafPem": leaf_cert.public_bytes(serialization.Encoding.PEM).decode("ascii"),
    "rootPem": root_cert.public_bytes(serialization.Encoding.PEM).decode("ascii"),
}))
`.trim();

  const out = childProcess.execFileSync("python", ["-c", python], { encoding: "utf8" });
  return JSON.parse(out);
}

test("XadesKeyPair.fromPkcs12 selects leaf cert and builds chain", { skip: !(await hasNodeForge()) }, async () => {
  const bundle = generatePkcs12Bundle();
  const pkcs12Bytes = Buffer.from(bundle.pkcs12Base64, "base64");

  const pair = await XadesKeyPair.fromPkcs12({ pkcs12Bytes });

  assert.match(pair.certificatePem, /BEGIN CERTIFICATE/);
  assert.match(new crypto.X509Certificate(pair.certificatePem).subject, /CN=Leaf/);
  assert.ok(Array.isArray(pair.certificateChainPem));
  assert.equal(pair.certificateChainPem.length, 1);
  assert.match(new crypto.X509Certificate(pair.certificateChainPem[0]).subject, /CN=Root/);
});
