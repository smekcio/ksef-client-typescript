import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DOMParser } from "@xmldom/xmldom";
import xmlCrypto from "xml-crypto";
import xpath from "xpath";
import { test } from "node:test";
import { XadesKeyPair, XadesSignatureService } from "../../dist/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesPath = path.join(__dirname, "..", "fixtures", "xades-fixtures.json");
const fixtures = JSON.parse(fs.readFileSync(fixturesPath, "utf8"));
const DS_NS = "http://www.w3.org/2000/09/xmldsig#";
const ECDSA_SHA256_URI = "http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256";

function createKeyPair() {
  return XadesKeyPair.fromPem({
    certificatePem: fixtures.ecCertPem,
    privateKeyPem: fixtures.ecKeyPem,
  });
}

function baseFakeSignedXml() {
  return class FakeSignedXml {
    constructor() {
      this.references = [];
      this.SignatureAlgorithms = undefined;
    }

    addReference(reference) {
      this.references.push(reference);
    }

    getReferences() {
      return this.references;
    }

    ensureHasId() {
      return "node-id";
    }

    findCanonicalizationAlgorithm(uri) {
      return { getAlgorithmName: () => uri };
    }

    getCanonReferenceXml() {
      return "<canon/>";
    }

    findHashAlgorithm(uri) {
      return {
        getAlgorithmName: () => uri,
        getHash: () => "HASH",
      };
    }
  };
}

test("XadesSignatureService throws when SignedInfo XML fragment cannot be parsed", () => {
  const signedXmlDescriptor = Object.getOwnPropertyDescriptor(xmlCrypto, "SignedXml");
  class EmptySignedInfoSignedXml extends baseFakeSignedXml() {
    createSignedInfo() {
      return "";
    }
  }

  Object.defineProperty(xmlCrypto, "SignedXml", {
    configurable: true,
    enumerable: true,
    get: () => EmptySignedInfoSignedXml,
  });
  try {
    const service = new XadesSignatureService();
    assert.throws(
      () =>
        service.signXadesEnveloped({
          xml: "<AuthTokenRequest/>",
          keyPair: createKeyPair(),
        }),
      /Failed to create SignedInfo node|Failed to parse XML fragment/,
    );
  } finally {
    Object.defineProperty(xmlCrypto, "SignedXml", signedXmlDescriptor);
  }
});

test("XadesSignatureService throws when SignedInfo node import returns null", () => {
  const originalParse = DOMParser.prototype.parseFromString;
  DOMParser.prototype.parseFromString = function patchedParseFromString(xml, mimeType) {
    const parsed = originalParse.call(this, xml, mimeType);
    if (xml === "<AuthTokenRequest/>") {
      parsed.importNode = () => null;
    }
    return parsed;
  };

  try {
    const service = new XadesSignatureService();
    assert.throws(
      () =>
        service.signXadesEnveloped({
          xml: "<AuthTokenRequest/>",
          keyPair: createKeyPair(),
        }),
      /Failed to create SignedInfo node/,
    );
  } finally {
    DOMParser.prototype.parseFromString = originalParse;
  }
});

test("XadesSignatureService propagates patched createReferences xpath-not-found error", () => {
  const signedXmlDescriptor = Object.getOwnPropertyDescriptor(xmlCrypto, "SignedXml");
  const originalSelect = xpath.selectWithResolver;
  class MissingXpathSignedXml extends baseFakeSignedXml() {
    createSignedInfo(doc) {
      this.createReferences(doc);
      return "<ds:SignedInfo xmlns:ds='http://www.w3.org/2000/09/xmldsig#'/>";
    }
  }

  Object.defineProperty(xmlCrypto, "SignedXml", {
    configurable: true,
    enumerable: true,
    get: () => MissingXpathSignedXml,
  });
  xpath.selectWithResolver = () => [];

  try {
    const service = new XadesSignatureService();
    assert.throws(
      () =>
        service.signXadesEnveloped({
          xml: "<AuthTokenRequest/>",
          keyPair: createKeyPair(),
        }),
      /cannot be signed because it was not found/,
    );
  } finally {
    xpath.selectWithResolver = originalSelect;
    Object.defineProperty(xmlCrypto, "SignedXml", signedXmlDescriptor);
  }
});

test("XadesSignatureService covers custom references, inclusive namespaces and ECDSA verify path", () => {
  const signedXmlDescriptor = Object.getOwnPropertyDescriptor(xmlCrypto, "SignedXml");
  const originalSelect = xpath.selectWithResolver;
  class FullFlowSignedXml extends baseFakeSignedXml() {
    addReference(reference) {
      const normalized = { ...reference };
      if (this.references.length === 0) {
        normalized.inclusiveNamespacesPrefixList = ["ds", "xades"];
      }
      this.references.push(normalized);
    }

    createSignedInfo(doc) {
      const referencesXml = this.createReferences(doc);
      return `<ds:SignedInfo xmlns:ds="${DS_NS}">${referencesXml}</ds:SignedInfo>`;
    }

    calculateSignatureValue() {
      const algorithmClass = this.SignatureAlgorithms?.[ECDSA_SHA256_URI];
      assert.ok(algorithmClass, "ECDSA algorithm should be available");
      const algorithm = new algorithmClass();

      const ecPair = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
      const material = "<SignedInfo>material</SignedInfo>";
      const signatureFromKeyObject = algorithm.getSignature(material, ecPair.privateKey);
      assert.equal(
        algorithm.verifySignature(material, ecPair.publicKey, signatureFromKeyObject),
        true,
      );

      const privatePem = ecPair.privateKey.export({ format: "pem", type: "pkcs8" });
      const publicPem = ecPair.publicKey.export({ format: "pem", type: "spki" });
      const signatureFromPem = algorithm.getSignature(material, privatePem);
      assert.equal(algorithm.verifySignature(material, publicPem, signatureFromPem), true);
      assert.equal(algorithm.getAlgorithmName(), ECDSA_SHA256_URI);
    }

    createSignature() {
      return new DOMParser().parseFromString(
        `<ds:SignatureValue xmlns:ds="${DS_NS}">sig</ds:SignatureValue>`,
        "application/xml",
      ).documentElement;
    }

    getKeyInfo() {
      return `<ds:KeyInfo xmlns:ds="${DS_NS}"><ds:X509Data/></ds:KeyInfo>`;
    }
  }

  Object.defineProperty(xmlCrypto, "SignedXml", {
    configurable: true,
    enumerable: true,
    get: () => FullFlowSignedXml,
  });
  xpath.selectWithResolver = (_expression, doc) => [doc.documentElement];

  try {
    const service = new XadesSignatureService();
    const signedXml = service.signXadesEnveloped({
      xml: "<AuthTokenRequest/>",
      keyPair: createKeyPair(),
    });

    assert.match(signedXml, /InclusiveNamespaces PrefixList="ds xades"/);
    assert.match(signedXml, /<ds:KeyInfo/);
    assert.match(signedXml, /<ds:SignatureValue/);
  } finally {
    xpath.selectWithResolver = originalSelect;
    Object.defineProperty(xmlCrypto, "SignedXml", signedXmlDescriptor);
  }
});

test("XadesSignatureService keeps preconfigured ECDSA algorithm without overriding it", () => {
  const signedXmlDescriptor = Object.getOwnPropertyDescriptor(xmlCrypto, "SignedXml");
  const originalSelect = xpath.selectWithResolver;

  let preconfiguredUsed = false;
  class PreconfiguredAlgorithm {
    getAlgorithmName() {
      return ECDSA_SHA256_URI;
    }

    getSignature() {
      preconfiguredUsed = true;
      return Buffer.from("sig").toString("base64");
    }

    verifySignature() {
      preconfiguredUsed = true;
      return true;
    }
  }

  class PreconfiguredSignedXml extends baseFakeSignedXml() {
    constructor() {
      super();
      this.SignatureAlgorithms = { [ECDSA_SHA256_URI]: PreconfiguredAlgorithm };
    }

    createSignedInfo(doc) {
      this.createReferences(doc);
      return `<ds:SignedInfo xmlns:ds="${DS_NS}"/>`;
    }

    calculateSignatureValue() {
      const algorithm = new this.SignatureAlgorithms[ECDSA_SHA256_URI]();
      algorithm.getSignature();
      algorithm.verifySignature();
    }

    createSignature() {
      return new DOMParser().parseFromString(
        `<ds:SignatureValue xmlns:ds="${DS_NS}">sig</ds:SignatureValue>`,
        "application/xml",
      ).documentElement;
    }

    getKeyInfo() {
      return "";
    }
  }

  Object.defineProperty(xmlCrypto, "SignedXml", {
    configurable: true,
    enumerable: true,
    get: () => PreconfiguredSignedXml,
  });
  xpath.selectWithResolver = (_expression, doc) => [doc.documentElement];

  try {
    const service = new XadesSignatureService();
    const signedXml = service.signXadesEnveloped({
      xml: "<AuthTokenRequest/>",
      keyPair: createKeyPair(),
    });
    assert.equal(preconfiguredUsed, true);
    assert.match(signedXml, /<ds:SignatureValue/);
  } finally {
    xpath.selectWithResolver = originalSelect;
    Object.defineProperty(xmlCrypto, "SignedXml", signedXmlDescriptor);
  }
});

test("XadesSignatureService rejects unsupported certificate public key types", () => {
  const originalX509 = crypto.X509Certificate;
  class UnsupportedX509 {
    constructor() {
      this.publicKey = { asymmetricKeyType: "ed25519" };
      this.raw = Buffer.from([1, 2, 3]);
      this.issuer = "CN=Unsupported";
      this.subject = "CN=Unsupported";
      this.serialNumber = "01";
    }
  }

  crypto.X509Certificate = UnsupportedX509;
  try {
    const service = new XadesSignatureService();
    assert.throws(
      () =>
        service.signXadesEnveloped({
          xml: "<AuthTokenRequest/>",
          keyPair: createKeyPair(),
        }),
      /Unsupported key type for XAdES/,
    );
  } finally {
    crypto.X509Certificate = originalX509;
  }
});

test("XadesSignatureService reports unknown key type when certificate key type is missing", () => {
  const originalX509 = crypto.X509Certificate;
  class MissingTypeX509 {
    constructor() {
      this.publicKey = { asymmetricKeyType: undefined };
      this.raw = Buffer.from([1, 2, 3]);
      this.issuer = "CN=Unsupported";
      this.subject = "CN=Unsupported";
      this.serialNumber = "01";
    }
  }

  crypto.X509Certificate = MissingTypeX509;
  try {
    const service = new XadesSignatureService();
    assert.throws(
      () =>
        service.signXadesEnveloped({
          xml: "<AuthTokenRequest/>",
          keyPair: createKeyPair(),
        }),
      /Unsupported key type for XAdES: unknown/,
    );
  } finally {
    crypto.X509Certificate = originalX509;
  }
});

test("XadesSignatureService validates missing document element in enveloped mode", () => {
  const originalParse = DOMParser.prototype.parseFromString;
  DOMParser.prototype.parseFromString = function patchedParseFromString(xml, mimeType) {
    if (xml === "<AuthTokenRequest/>") {
      return { documentElement: null };
    }
    return originalParse.call(this, xml, mimeType);
  };

  try {
    const service = new XadesSignatureService();
    assert.throws(
      () =>
        service.signXadesEnveloped({
          xml: "<AuthTokenRequest/>",
          keyPair: createKeyPair(),
        }),
      /Invalid XML: missing document element/,
    );
  } finally {
    DOMParser.prototype.parseFromString = originalParse;
  }
});

test("XadesSignatureService validates missing document element in enveloping mode", () => {
  const originalParse = DOMParser.prototype.parseFromString;
  DOMParser.prototype.parseFromString = function patchedParseFromString(xml, mimeType) {
    if (xml === "<AuthTokenRequest/>") {
      return { documentElement: null };
    }
    return originalParse.call(this, xml, mimeType);
  };

  try {
    const service = new XadesSignatureService();
    assert.throws(
      () =>
        service.signXadesEnveloping({
          xml: "<AuthTokenRequest/>",
          keyPair: createKeyPair(),
        }),
      /Invalid XML: missing document element/,
    );
  } finally {
    DOMParser.prototype.parseFromString = originalParse;
  }
});

test("XadesSignatureService supports environments without importNode in enveloping mode", () => {
  const originalParse = DOMParser.prototype.parseFromString;
  DOMParser.prototype.parseFromString = function patchedParseFromString(xml, mimeType) {
    const parsed = originalParse.call(this, xml, mimeType);
    if (xml.startsWith(`<ds:Signature xmlns:ds="${DS_NS}">`)) {
      parsed.importNode = undefined;
    }
    return parsed;
  };

  try {
    const service = new XadesSignatureService();
    const signedXml = service.signXadesEnveloping({
      xml: "<AuthTokenRequest/>",
      keyPair: createKeyPair(),
    });
    assert.match(signedXml, /<ds:Signature/);
  } finally {
    DOMParser.prototype.parseFromString = originalParse;
  }
});

test("XadesSignatureService rejects when xpath resolver returns non-array", () => {
  const signedXmlDescriptor = Object.getOwnPropertyDescriptor(xmlCrypto, "SignedXml");
  const originalSelect = xpath.selectWithResolver;
  class NonArrayXpathSignedXml extends baseFakeSignedXml() {
    createSignedInfo(doc) {
      this.createReferences(doc);
      return `<ds:SignedInfo xmlns:ds="${DS_NS}"/>`;
    }
  }

  Object.defineProperty(xmlCrypto, "SignedXml", {
    configurable: true,
    enumerable: true,
    get: () => NonArrayXpathSignedXml,
  });
  xpath.selectWithResolver = () => ({ not: "an-array" });

  try {
    const service = new XadesSignatureService();
    assert.throws(
      () =>
        service.signXadesEnveloped({
          xml: "<AuthTokenRequest/>",
          keyPair: createKeyPair(),
        }),
      /cannot be signed because it was not found/,
    );
  } finally {
    xpath.selectWithResolver = originalSelect;
    Object.defineProperty(xmlCrypto, "SignedXml", signedXmlDescriptor);
  }
});

test("XadesSignatureService createReferences handles missing transforms array", () => {
  const signedXmlDescriptor = Object.getOwnPropertyDescriptor(xmlCrypto, "SignedXml");
  const originalSelect = xpath.selectWithResolver;
  class NoTransformsSignedXml extends baseFakeSignedXml() {
    addReference(reference) {
      const normalized = { ...reference };
      if (this.references.length === 0) {
        delete normalized.transforms;
      }
      this.references.push(normalized);
    }

    createSignedInfo(doc) {
      const referencesXml = this.createReferences(doc);
      return `<ds:SignedInfo xmlns:ds="${DS_NS}">${referencesXml}</ds:SignedInfo>`;
    }

    calculateSignatureValue() {}

    createSignature() {
      return new DOMParser().parseFromString(
        `<ds:SignatureValue xmlns:ds="${DS_NS}">sig</ds:SignatureValue>`,
        "application/xml",
      ).documentElement;
    }

    getKeyInfo() {
      return "";
    }
  }

  Object.defineProperty(xmlCrypto, "SignedXml", {
    configurable: true,
    enumerable: true,
    get: () => NoTransformsSignedXml,
  });
  xpath.selectWithResolver = (_expression, doc) => [doc.documentElement];

  try {
    const service = new XadesSignatureService();
    const signedXml = service.signXadesEnveloped({
      xml: "<AuthTokenRequest/>",
      keyPair: createKeyPair(),
    });
    assert.match(signedXml, /<ds:SignatureValue/);
  } finally {
    xpath.selectWithResolver = originalSelect;
    Object.defineProperty(xmlCrypto, "SignedXml", signedXmlDescriptor);
  }
});

test("XadesSignatureService createReferences handles missing xpath by falling back to empty expression", () => {
  const signedXmlDescriptor = Object.getOwnPropertyDescriptor(xmlCrypto, "SignedXml");
  const originalSelect = xpath.selectWithResolver;
  class MissingXpathFieldSignedXml extends baseFakeSignedXml() {
    addReference(reference) {
      const normalized = { ...reference };
      if (this.references.length === 0) {
        delete normalized.xpath;
      }
      this.references.push(normalized);
    }

    createSignedInfo(doc) {
      this.createReferences(doc);
      return `<ds:SignedInfo xmlns:ds="${DS_NS}"/>`;
    }

    calculateSignatureValue() {}

    createSignature() {
      return new DOMParser().parseFromString(
        `<ds:SignatureValue xmlns:ds="${DS_NS}">sig</ds:SignatureValue>`,
        "application/xml",
      ).documentElement;
    }

    getKeyInfo() {
      return "";
    }
  }

  Object.defineProperty(xmlCrypto, "SignedXml", {
    configurable: true,
    enumerable: true,
    get: () => MissingXpathFieldSignedXml,
  });
  xpath.selectWithResolver = (_expression, doc) => [doc.documentElement];

  try {
    const service = new XadesSignatureService();
    const signedXml = service.signXadesEnveloped({
      xml: "<AuthTokenRequest/>",
      keyPair: createKeyPair(),
    });
    assert.match(signedXml, /<ds:SignatureValue/);
  } finally {
    xpath.selectWithResolver = originalSelect;
    Object.defineProperty(xmlCrypto, "SignedXml", signedXmlDescriptor);
  }
});

test("XadesSignatureService executes namespace resolver callbacks in both signing modes", () => {
  const signedXmlDescriptor = Object.getOwnPropertyDescriptor(xmlCrypto, "SignedXml");
  const originalSelect = xpath.selectWithResolver;

  let resolverCalls = 0;
  class ResolverProbeSignedXml extends baseFakeSignedXml() {
    createSignedInfo(doc) {
      if (this.namespaceResolver?.lookupNamespaceURI) {
        this.namespaceResolver.lookupNamespaceURI("ds");
        resolverCalls += 1;
      }
      this.createReferences(doc);
      return `<ds:SignedInfo xmlns:ds="${DS_NS}"/>`;
    }

    calculateSignatureValue() {}

    createSignature() {
      return new DOMParser().parseFromString(
        `<ds:SignatureValue xmlns:ds="${DS_NS}">sig</ds:SignatureValue>`,
        "application/xml",
      ).documentElement;
    }

    getKeyInfo() {
      return "";
    }
  }

  Object.defineProperty(xmlCrypto, "SignedXml", {
    configurable: true,
    enumerable: true,
    get: () => ResolverProbeSignedXml,
  });
  xpath.selectWithResolver = (_expression, doc) => [doc.documentElement];

  try {
    const service = new XadesSignatureService();
    service.signXadesEnveloped({
      xml: "<AuthTokenRequest/>",
      keyPair: createKeyPair(),
    });
    service.signXadesEnveloping({
      xml: "<AuthTokenRequest/>",
      keyPair: createKeyPair(),
    });
    assert.equal(resolverCalls, 2);
  } finally {
    xpath.selectWithResolver = originalSelect;
    Object.defineProperty(xmlCrypto, "SignedXml", signedXmlDescriptor);
  }
});
