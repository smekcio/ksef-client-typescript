import crypto from "node:crypto";
import { toBase64Url, fromBase64Url } from "../utils/base64url";

export interface VerificationLinkServiceOptions {
  baseQrUrl: string;
}

export class VerificationLinkService {
  private readonly baseQrUrl: string;

  constructor(options: VerificationLinkServiceOptions) {
    this.baseQrUrl = options.baseQrUrl.replace(/\/$/, "");
  }

  buildInvoiceVerificationUrl(nip: string, issueDate: Date | string, invoiceHash: string): string {
    const dateString = formatDate(issueDate);
    const hashBytes = decodeBase64OrUrl(invoiceHash);
    const hashUrl = toBase64Url(hashBytes);
    return `${this.baseQrUrl}/invoice/${nip}/${dateString}/${hashUrl}`;
  }

  buildCertificateVerificationUrl(options: {
    sellerNip: string;
    contextIdentifierType: string;
    contextIdentifierValue: string;
    certificateSerial: string;
    invoiceHash: string;
    privateKeyPem: string;
    privateKeyPassword?: string;
    signatureFormat?: "p1363" | "der";
  }): string {
    const hashBytes = decodeBase64OrUrl(options.invoiceHash);
    const hashUrl = toBase64Url(hashBytes);
    const path = [
      this.baseQrUrl,
      "certificate",
      options.contextIdentifierType,
      options.contextIdentifierValue,
      options.sellerNip,
      options.certificateSerial,
      hashUrl,
    ].join("/");
    const pathToSign = path.replace(/^https?:\/\//, "");
    const signature = signPath(
      pathToSign,
      options.privateKeyPem,
      options.privateKeyPassword,
      options.signatureFormat ?? "p1363",
    );
    const signatureUrl = toBase64Url(signature);
    return `${path}/${signatureUrl}`;
  }
}

function formatDate(value: Date | string): string {
  if (value instanceof Date) {
    const day = `${value.getDate()}`.padStart(2, "0");
    const month = `${value.getMonth() + 1}`.padStart(2, "0");
    const year = `${value.getFullYear()}`;
    return `${day}-${month}-${year}`;
  }
  return value;
}

function decodeBase64OrUrl(value: string): Buffer {
  if (value.includes("-") || value.includes("_")) {
    return fromBase64Url(value);
  }
  return Buffer.from(value, "base64");
}

function signPath(
  pathToSign: string,
  privateKeyPem: string,
  privateKeyPassword: string | undefined,
  signatureFormat: "p1363" | "der",
): Buffer {
  const privateKey = loadPrivateKey(privateKeyPem, privateKeyPassword);
  const digest = crypto.createHash("sha256").update(pathToSign, "utf8").digest();
  if (privateKey.asymmetricKeyType === "rsa") {
    return crypto.sign(null, digest, {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_MAX_SIGN,
    });
  }
  if (privateKey.asymmetricKeyType === "ec") {
    return crypto.sign(null, digest, {
      key: privateKey,
      dsaEncoding: signatureFormat === "der" ? "der" : "ieee-p1363",
    });
  }
  throw new Error("Unsupported private key type for signature.");
}

function loadPrivateKey(privateKeyPem: string, privateKeyPassword?: string): crypto.KeyObject {
  try {
    return crypto.createPrivateKey({
      key: privateKeyPem,
      format: "pem",
      passphrase: privateKeyPassword,
    });
  } catch (error) {
    throw mapPrivateKeyLoadError(error);
  }
}

function mapPrivateKeyLoadError(error: unknown): Error {
  const message = error instanceof Error ? error.message : "";
  const opensslErrorStack = Array.isArray((error as { opensslErrorStack?: unknown })?.opensslErrorStack)
    ? ((error as { opensslErrorStack?: unknown[] }).opensslErrorStack ?? [])
        .filter((entry): entry is string => typeof entry === "string")
    : [];
  const details = [message, ...opensslErrorStack].join("\n");

  if (
    details.includes("bad password read")
    || details.includes("unable to get passphrase")
  ) {
    return new Error("Private key is encrypted; provide privateKeyPassword.");
  }
  if (
    details.includes("bad decrypt")
    || details.includes("cipherfinal error")
  ) {
    return new Error("Failed to decrypt private key; check privateKeyPassword.");
  }
  return new Error("Failed to load private key from PEM.");
}
