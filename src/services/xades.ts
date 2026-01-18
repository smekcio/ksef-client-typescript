import crypto from "node:crypto";
import fs from "node:fs";
import { DOMParser } from "@xmldom/xmldom";
import xmlCrypto from "xml-crypto";
import xpath from "xpath";

const DS_NS = "http://www.w3.org/2000/09/xmldsig#";
const XADES_NS = "http://uri.etsi.org/01903/v1.3.2#";
const SIGNED_PROPERTIES_TYPE = "http://uri.etsi.org/01903#SignedProperties";

export interface XadesPemKeyPairOptions {
  certificatePem: string;
  privateKeyPem: string;
  privateKeyPassword?: string;
}

export interface XadesPemKeyPairFilesOptions {
  certificatePath: string;
  privateKeyPath: string;
  privateKeyPassword?: string;
}

export interface XadesPkcs12KeyPairOptions {
  pkcs12Bytes: Uint8Array;
  pkcs12Password?: string;
}

export interface XadesPkcs12KeyPairFileOptions {
  pkcs12Path: string;
  pkcs12Password?: string;
}

export class XadesKeyPair {
  readonly certificatePem: string;
  readonly privateKey: crypto.KeyObject;
  readonly certificateChainPem: readonly string[];

  private constructor(
    certificatePem: string,
    privateKey: crypto.KeyObject,
    certificateChainPem: readonly string[] = [],
  ) {
    this.certificatePem = ensurePemCertificate(certificatePem);
    this.privateKey = privateKey;
    this.certificateChainPem = certificateChainPem.map(ensurePemCertificate);
  }

  static fromPem(options: XadesPemKeyPairOptions): XadesKeyPair {
    const privateKey = crypto.createPrivateKey({
      key: options.privateKeyPem,
      format: "pem",
      passphrase: options.privateKeyPassword,
    });
    return new XadesKeyPair(options.certificatePem, privateKey);
  }

  static fromPemFiles(options: XadesPemKeyPairFilesOptions): XadesKeyPair {
    const certificatePem = readCertificateAsPem(options.certificatePath);
    const privateKeyPem = fs.readFileSync(options.privateKeyPath);
    const privateKey = readPrivateKey(privateKeyPem, options.privateKeyPassword);
    return new XadesKeyPair(certificatePem, privateKey);
  }

  static async fromPkcs12(options: XadesPkcs12KeyPairOptions): Promise<XadesKeyPair> {
    const { certificatePem, privateKeyPem, certificateChainPem } = await loadFromPkcs12(options);
    const privateKey = crypto.createPrivateKey({
      key: privateKeyPem,
      format: "pem",
    });
    return new XadesKeyPair(certificatePem, privateKey, certificateChainPem);
  }

  static async fromPkcs12File(options: XadesPkcs12KeyPairFileOptions): Promise<XadesKeyPair> {
    const pkcs12Bytes = fs.readFileSync(options.pkcs12Path);
    return await XadesKeyPair.fromPkcs12({
      pkcs12Bytes,
      ...(options.pkcs12Password !== undefined && { pkcs12Password: options.pkcs12Password }),
    });
  }
}

export interface SignXadesEnvelopedOptions {
  xml: string;
  keyPair: XadesKeyPair;
  signatureId?: string;
  signedPropertiesId?: string;
  signingTime?: Date;
  signingTimeSkewMs?: number;
}

export class XadesSignatureService {
  signXadesEnveloped(options: SignXadesEnvelopedOptions): string {
    const signatureId = options.signatureId ?? `Signature-${crypto.randomUUID()}`;
    const signedPropertiesId = options.signedPropertiesId ?? "SignedProperties";

    const signingTime =
      options.signingTime ??
      new Date(Date.now() + (options.signingTimeSkewMs ?? -60_000));

    const { certificatePem, privateKey } = options.keyPair;
    const certificate = new crypto.X509Certificate(certificatePem);

    const signatureAlgorithm = signatureAlgorithmForCertificate(certificate);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { SignedXml } = xmlCrypto as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sig = new SignedXml() as any;

    sig.signatureAlgorithm = signatureAlgorithm;
    sig.canonicalizationAlgorithm = "http://www.w3.org/2001/10/xml-exc-c14n#";
    sig.privateKey = privateKey;
    sig.publicCert = certificatePem;

    patchSignedXmlCreateReferences(sig);
    ensureEcdsaSha256Algorithm(sig);

    sig.addReference({
      xpath: "/*[local-name()='AuthTokenRequest']",
      transforms: [
        "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
        "http://www.w3.org/2001/10/xml-exc-c14n#",
      ],
      digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
      isEmptyUri: true,
    });

    sig.addReference({
      xpath: `//*[local-name(.)='SignedProperties' and @Id='${signedPropertiesId}']`,
      transforms: ["http://www.w3.org/2001/10/xml-exc-c14n#"],
      digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
    });
    (sig.getReferences().at(-1) as unknown as { type?: string }).type = SIGNED_PROPERTIES_TYPE;

    const doc = new DOMParser().parseFromString(options.xml, "application/xml");
    if (!doc.documentElement) {
      throw new Error("Invalid XML: missing document element.");
    }

    const signatureNode = createSignatureSkeleton({
      doc,
      signatureId,
      signedPropertiesId,
      certificate,
      signingTime,
    });
    doc.documentElement.appendChild(signatureNode);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sig as any).namespaceResolver = { lookupNamespaceURI: () => null };

    const signedInfoNode = parseIntoDocument(
      doc,
      `<ds:Signature xmlns:ds="${DS_NS}">${(sig as any).createSignedInfo(doc, "ds")}</ds:Signature>`,
    );
    if (!signedInfoNode) {
      throw new Error("Failed to create SignedInfo node.");
    }
    signatureNode.insertBefore(signedInfoNode, signatureNode.firstChild);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sig as any).signatureNode = signatureNode;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sig as any).calculateSignatureValue(doc);

    const signatureValueNode = (sig as any).createSignature("ds") as ChildNode;
    signatureNode.insertBefore(signatureValueNode, signedInfoNode.nextSibling);

    const keyInfoXml = (sig as any).getKeyInfo("ds") as string;
    if (keyInfoXml) {
      const keyInfoNode = parseIntoDocument(
        doc,
        `<ds:Signature xmlns:ds="${DS_NS}">${keyInfoXml}</ds:Signature>`,
      );
      signatureNode.insertBefore(keyInfoNode, signatureValueNode.nextSibling);
    }

    return doc.toString();
  }

  signXadesEnveloping(options: SignXadesEnvelopedOptions): string {
    const signatureId = options.signatureId ?? `Signature-${crypto.randomUUID()}`;
    const signedPropertiesId = options.signedPropertiesId ?? "SignedProperties";
    const objectDataId = `ObjectData-${crypto.randomUUID()}`;

    const signingTime =
      options.signingTime ??
      new Date(Date.now() + (options.signingTimeSkewMs ?? -60_000));

    const { certificatePem, privateKey } = options.keyPair;
    const certificate = new crypto.X509Certificate(certificatePem);

    const signatureAlgorithm = signatureAlgorithmForCertificate(certificate);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { SignedXml } = xmlCrypto as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sig = new SignedXml() as any;

    sig.signatureAlgorithm = signatureAlgorithm;
    sig.canonicalizationAlgorithm = "http://www.w3.org/2001/10/xml-exc-c14n#";
    sig.privateKey = privateKey;
    sig.publicCert = certificatePem;

    patchSignedXmlCreateReferences(sig);
    ensureEcdsaSha256Algorithm(sig);

    const originalDoc = new DOMParser().parseFromString(options.xml, "application/xml");
    if (!originalDoc.documentElement) {
      throw new Error("Invalid XML: missing document element.");
    }

    // Create a new document where Signature is the root (enveloping).
    const signatureDoc = new DOMParser().parseFromString(
      `<ds:Signature xmlns:ds="${DS_NS}"></ds:Signature>`,
      "application/xml",
    );
    const signatureNode = signatureDoc.documentElement;
    signatureNode.setAttribute("Id", signatureId);

    // ds:Object holding the signed data
    const dataObjectNode = signatureDoc.createElementNS(DS_NS, "ds:Object");
    signatureNode.appendChild(dataObjectNode);

    // Move AuthTokenRequest into ds:Object and assign Id so Reference can target it
    const authTokenRequestNode = originalDoc.documentElement.cloneNode(true) as Element;
    authTokenRequestNode.setAttribute("Id", objectDataId);
    dataObjectNode.appendChild(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (signatureDoc as any).importNode ? (signatureDoc as any).importNode(authTokenRequestNode, true) : authTokenRequestNode,
    );

    // XAdES object
    const xadesObjectNode = signatureDoc.createElementNS(DS_NS, "ds:Object");
    signatureNode.appendChild(xadesObjectNode);
    xadesObjectNode.appendChild(
      createQualifyingPropertiesNode({
        doc: signatureDoc,
        signatureId,
        signedPropertiesId,
        certificate,
        signingTime,
      }),
    );

    // Reference to AuthTokenRequest (enveloping: no enveloped transform)
    sig.addReference({
      xpath: `//*[local-name()='AuthTokenRequest' and @Id='${objectDataId}']`,
      transforms: ["http://www.w3.org/2001/10/xml-exc-c14n#"],
      digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
    });

    // Reference to SignedProperties
    sig.addReference({
      xpath: `//*[local-name(.)='SignedProperties' and @Id='${signedPropertiesId}']`,
      transforms: ["http://www.w3.org/2001/10/xml-exc-c14n#"],
      digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
    });
    (sig.getReferences().at(-1) as unknown as { type?: string }).type = SIGNED_PROPERTIES_TYPE;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sig as any).namespaceResolver = { lookupNamespaceURI: () => null };

    const signedInfoNode = parseIntoDocument(
      signatureDoc,
      `<ds:Signature xmlns:ds="${DS_NS}">${(sig as any).createSignedInfo(signatureDoc, "ds")}</ds:Signature>`,
    );
    signatureNode.insertBefore(signedInfoNode, signatureNode.firstChild);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sig as any).signatureNode = signatureNode;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sig as any).calculateSignatureValue(signatureDoc);

    const signatureValueNode = (sig as any).createSignature("ds") as ChildNode;
    signatureNode.insertBefore(signatureValueNode, signedInfoNode.nextSibling);

    const keyInfoXml = (sig as any).getKeyInfo("ds") as string;
    if (keyInfoXml) {
      const keyInfoNode = parseIntoDocument(
        signatureDoc,
        `<ds:Signature xmlns:ds="${DS_NS}">${keyInfoXml}</ds:Signature>`,
      );
      signatureNode.insertBefore(keyInfoNode, signatureValueNode.nextSibling);
    }

    return signatureDoc.toString();
  }
}

function signatureAlgorithmForCertificate(certificate: crypto.X509Certificate): string {
  const publicKeyType = certificate.publicKey.asymmetricKeyType;
  if (publicKeyType === "rsa") {
    return "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
  }
  if (publicKeyType === "ec") {
    return "http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256";
  }
  throw new Error(`Unsupported key type for XAdES: ${publicKeyType ?? "unknown"}`);
}

function createSignatureSkeleton(options: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc: any;
  signatureId: string;
  signedPropertiesId: string;
  certificate: crypto.X509Certificate;
  signingTime: Date;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}): any {
  const signature = options.doc.createElementNS(DS_NS, "ds:Signature");
  signature.setAttribute("Id", options.signatureId);

  const objectNode = options.doc.createElementNS(DS_NS, "ds:Object");
  signature.appendChild(objectNode);
  objectNode.appendChild(
    createQualifyingPropertiesNode({
      doc: options.doc,
      signatureId: options.signatureId,
      signedPropertiesId: options.signedPropertiesId,
      certificate: options.certificate,
      signingTime: options.signingTime,
    }),
  );

  return signature;
}

function createQualifyingPropertiesNode(options: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc: any;
  signatureId: string;
  signedPropertiesId: string;
  certificate: crypto.X509Certificate;
  signingTime: Date;
}): Element {
  const qualifyingProps = options.doc.createElementNS(XADES_NS, "xades:QualifyingProperties");
  qualifyingProps.setAttribute("Target", `#${options.signatureId}`);

  const signedProperties = options.doc.createElementNS(XADES_NS, "xades:SignedProperties");
  signedProperties.setAttribute("Id", options.signedPropertiesId);
  qualifyingProps.appendChild(signedProperties);

  const signedSignatureProperties = options.doc.createElementNS(
    XADES_NS,
    "xades:SignedSignatureProperties",
  );
  signedProperties.appendChild(signedSignatureProperties);

  const signingTimeNode = options.doc.createElementNS(XADES_NS, "xades:SigningTime");
  signingTimeNode.appendChild(options.doc.createTextNode(options.signingTime.toISOString()));
  signedSignatureProperties.appendChild(signingTimeNode);

  const signingCertificate = options.doc.createElementNS(XADES_NS, "xades:SigningCertificate");
  signedSignatureProperties.appendChild(signingCertificate);

  const certNode = options.doc.createElementNS(XADES_NS, "xades:Cert");
  signingCertificate.appendChild(certNode);

  const certDigestNode = options.doc.createElementNS(XADES_NS, "xades:CertDigest");
  certNode.appendChild(certDigestNode);

  const digestMethod = options.doc.createElementNS(DS_NS, "ds:DigestMethod");
  digestMethod.setAttribute("Algorithm", "http://www.w3.org/2001/04/xmlenc#sha256");
  certDigestNode.appendChild(digestMethod);

  const digestValue = options.doc.createElementNS(DS_NS, "ds:DigestValue");
  digestValue.appendChild(options.doc.createTextNode(certificateDigestBase64(options.certificate)));
  certDigestNode.appendChild(digestValue);

  const issuerSerial = options.doc.createElementNS(XADES_NS, "xades:IssuerSerial");
  certNode.appendChild(issuerSerial);

  const issuerName = options.doc.createElementNS(DS_NS, "ds:X509IssuerName");
  issuerName.appendChild(options.doc.createTextNode(normalizeIssuerDn(options.certificate.issuer)));
  issuerSerial.appendChild(issuerName);

  const serialNumber = options.doc.createElementNS(DS_NS, "ds:X509SerialNumber");
  serialNumber.appendChild(options.doc.createTextNode(serialNumberDecimal(options.certificate.serialNumber)));
  issuerSerial.appendChild(serialNumber);

  return qualifyingProps;
}

function certificateDigestBase64(certificate: crypto.X509Certificate): string {
  return crypto.createHash("sha256").update(certificate.raw).digest("base64");
}

function normalizeIssuerDn(issuer: string): string {
  return issuer
    .split("\n")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(",");
}

function serialNumberDecimal(serialNumberHex: string): string {
  return BigInt(`0x${serialNumberHex}`).toString(10);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseIntoDocument(doc: any, xml: string): any {
  const parsed = new DOMParser().parseFromString(xml, "application/xml");
  if (!parsed.documentElement?.firstChild) {
    throw new Error("Failed to parse XML fragment.");
  }
  // xmldom allows moving nodes between documents; clone to be safe.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const imported = (doc as any).importNode
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (doc as any).importNode(parsed.documentElement.firstChild, true)
    : parsed.documentElement.firstChild.cloneNode(true);
  return imported as ChildNode;
}

function ensureEcdsaSha256Algorithm(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sig: any,
): void {
  const uri = "http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256";
  if (sig.SignatureAlgorithms?.[uri]) {
    return;
  }
  sig.SignatureAlgorithms = {
    ...(sig.SignatureAlgorithms ?? {}),
    [uri]: class EcdsaSha256 {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getSignature(signedInfo: any, privateKey: any): string {
        const signer = crypto.createSign("SHA256");
        signer.update(signedInfo);
        return signer.sign({ key: privateKey, dsaEncoding: "der" }, "base64");
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      verifySignature(material: any, key: any, signatureValue: string): boolean {
        const verifier = crypto.createVerify("SHA256");
        verifier.update(material);
        return verifier.verify(key, signatureValue, "base64");
      }

      getAlgorithmName(): string {
        return uri;
      }
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function patchSignedXmlCreateReferences(sig: any): void {
  // xml-crypto does not emit Reference/@Type, but XAdES requires it for SignedProperties.
  // Patch the method at runtime to keep upstream dependency untouched.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sig as any).createReferences = function createReferences(doc: any, prefix?: string) {
    let res = "";
    let currentPrefix = prefix || "";
    currentPrefix = currentPrefix ? `${currentPrefix}:` : currentPrefix;

    // eslint-disable-next-line deprecation/deprecation
    for (const ref of this.getReferences()) {
      const nodes = xpath.selectWithResolver(ref.xpath ?? "", doc, this.namespaceResolver);
      if (!Array.isArray(nodes) || nodes.length === 0) {
        throw new Error(
          `the following xpath cannot be signed because it was not found: ${ref.xpath}`,
        );
      }
      for (const node of nodes) {
        const typeAttr = ref.type ? ` Type="${ref.type}"` : "";
        if (ref.isEmptyUri) {
          res += `<${currentPrefix}Reference URI=""${typeAttr}>`;
        } else {
          const id = this.ensureHasId(node);
          ref.uri = id;
          res += `<${currentPrefix}Reference URI="#${id}"${typeAttr}>`;
        }

        res += `<${currentPrefix}Transforms>`;
        for (const trans of ref.transforms || []) {
          const transform = this.findCanonicalizationAlgorithm(trans);
          res += `<${currentPrefix}Transform Algorithm="${transform.getAlgorithmName()}"`;
          if (Array.isArray(ref.inclusiveNamespacesPrefixList) && ref.inclusiveNamespacesPrefixList.length) {
            res += ">";
            res += `<InclusiveNamespaces PrefixList="${ref.inclusiveNamespacesPrefixList.join(
              " ",
            )}" xmlns="${transform.getAlgorithmName()}"/>`;
            res += `</${currentPrefix}Transform>`;
          } else {
            res += " />";
          }
        }

        const canonXml = this.getCanonReferenceXml(doc, ref, node);
        const digestAlgorithm = this.findHashAlgorithm(ref.digestAlgorithm);
        res +=
          `</${currentPrefix}Transforms>` +
          `<${currentPrefix}DigestMethod Algorithm="${digestAlgorithm.getAlgorithmName()}" />` +
          `<${currentPrefix}DigestValue>${digestAlgorithm.getHash(canonXml)}</${currentPrefix}DigestValue>` +
          `</${currentPrefix}Reference>`;
      }
    }
    return res;
  };
}

function ensurePemCertificate(value: string): string {
  if (value.includes("BEGIN CERTIFICATE")) {
    return value;
  }
  const der = Buffer.from(value, "base64");
  const b64 = der.toString("base64");
  const lines = b64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN CERTIFICATE-----\n${lines.join("\n")}\n-----END CERTIFICATE-----\n`;
}

function readCertificateAsPem(path: string): string {
  const raw = fs.readFileSync(path);
  if (raw.includes(Buffer.from("BEGIN CERTIFICATE", "ascii"))) {
    return raw.toString("utf8");
  }
  const cert = new crypto.X509Certificate(raw);
  return cert.toString();
}

function readPrivateKey(raw: Buffer, password?: string): crypto.KeyObject {
  const asText = raw.toString("utf8");
  if (asText.includes("BEGIN")) {
    return crypto.createPrivateKey({
      key: asText,
      format: "pem",
      passphrase: password,
    });
  }
  const types: Array<"pkcs8" | "pkcs1" | "sec1"> = ["pkcs8", "pkcs1", "sec1"];
  let lastError: unknown = null;
  for (const type of types) {
    try {
      return crypto.createPrivateKey({
        key: raw,
        format: "der",
        type,
        passphrase: password,
      });
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error("Unable to load private key (unsupported format or wrong password).", {
    cause: lastError as Error,
  });
}

async function loadFromPkcs12(
  options: XadesPkcs12KeyPairOptions,
): Promise<{ certificatePem: string; privateKeyPem: string; certificateChainPem: string[] }> {
  let forge: unknown;
  try {
    forge = await import("node-forge");
  } catch (err) {
    throw new Error(
      "PKCS#12 (.p12/.pfx) support requires optional dependency 'node-forge'. Install it with: npm i node-forge",
      { cause: err as Error },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const forgeAny = ((forge as any).default ?? forge) as any;
  const p12Asn1 = forgeAny.asn1.fromDer(Buffer.from(options.pkcs12Bytes).toString("binary"));
  const p12 = forgeAny.pkcs12.pkcs12FromAsn1(p12Asn1, options.pkcs12Password ?? "");

  const keyBags =
    p12.getBags({ bagType: forgeAny.pki.oids.pkcs8ShroudedKeyBag })[
      forgeAny.pki.oids.pkcs8ShroudedKeyBag
    ] ??
    p12.getBags({ bagType: forgeAny.pki.oids.keyBag })[forgeAny.pki.oids.keyBag] ??
    [];

  const certBags = p12.getBags({ bagType: forgeAny.pki.oids.certBag })[forgeAny.pki.oids.certBag] ?? [];

  if (!keyBags.length) {
    throw new Error("PKCS#12 does not contain a private key.");
  }
  if (!certBags.length) {
    throw new Error("PKCS#12 does not contain a certificate.");
  }

  const keyCandidates = keyBags
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((bag: any) => ({
      localKeyId: normalizeLocalKeyId(bag?.attributes?.localKeyId),
      privateKeyPem: forgeAny.pki.privateKeyToPem(bag.key),
    }));

  const certCandidates = certBags
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((bag: any) => ({
      localKeyId: normalizeLocalKeyId(bag?.attributes?.localKeyId),
      certificatePem: forgeAny.pki.certificateToPem(bag.cert),
    }));

  // Prefer pairing by localKeyId if present in both key and cert bags.
  let chosen: { privateKeyPem: string; certificatePem: string } | null = null;
  for (const key of keyCandidates) {
    if (!key.localKeyId) {
      continue;
    }
    const hit = certCandidates.find(
      (c: { localKeyId: string | null; certificatePem: string }) =>
        c.localKeyId != null && c.localKeyId === key.localKeyId,
    );
    if (hit) {
      chosen = { privateKeyPem: key.privateKeyPem, certificatePem: hit.certificatePem };
      break;
    }
  }

  // Fallback: match by comparing public keys
  if (!chosen) {
    for (const key of keyCandidates) {
      const privateKeyObj = crypto.createPrivateKey({ key: key.privateKeyPem, format: "pem" });
      const pubFromKey = crypto
        .createPublicKey(privateKeyObj)
        .export({ type: "spki", format: "der" })
        .toString("base64");

      for (const cert of certCandidates) {
        const x509 = new crypto.X509Certificate(cert.certificatePem);
        const pubFromCert = x509.publicKey.export({ type: "spki", format: "der" }).toString("base64");
        if (pubFromCert === pubFromKey) {
          chosen = { privateKeyPem: key.privateKeyPem, certificatePem: cert.certificatePem };
          break;
        }
      }
      if (chosen) break;
    }
  }

  if (!chosen) {
    throw new Error("PKCS#12 does not contain a matching private key and certificate.");
  }

  const chain = buildCertificateChainPem(
    chosen.certificatePem,
    certCandidates.map((c: { certificatePem: string }) => c.certificatePem),
  );

  return { ...chosen, certificateChainPem: chain };
}

function normalizeLocalKeyId(value: unknown): string | null {
  // node-forge represents bag attributes as { attrName: [binaryString] }.
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const first = value[0] as unknown;
  if (typeof first === "string") {
    return Buffer.from(first, "binary").toString("hex");
  }
  if (first instanceof Uint8Array) {
    return Buffer.from(first).toString("hex");
  }
  return null;
}

function buildCertificateChainPem(leafPem: string, allPem: string[]): string[] {
  const leaf = new crypto.X509Certificate(ensurePemCertificate(leafPem));

  const certs = allPem
    .map(ensurePemCertificate)
    .map((pem) => new crypto.X509Certificate(pem));

  const bySubject = new Map<string, crypto.X509Certificate>();
  for (const c of certs) {
    bySubject.set(normalizeIssuerDn(c.subject), c);
  }

  const chain: crypto.X509Certificate[] = [];
  let current = leaf;
  for (let i = 0; i < certs.length + 1; i += 1) {
    const issuer = normalizeIssuerDn(current.issuer);
    const subject = normalizeIssuerDn(current.subject);
    if (issuer === subject) {
      break; // self-signed root
    }
    const parent = bySubject.get(issuer);
    if (!parent) {
      break;
    }
    chain.push(parent);
    current = parent;
  }

  return chain.map((c) => c.toString());
}
