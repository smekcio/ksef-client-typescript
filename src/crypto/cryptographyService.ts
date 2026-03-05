import crypto from "node:crypto";
import { EncryptionInfo, FileMetadata } from "../types/common";
import { toBase64Url } from "../utils/base64url";

export interface EncryptionData {
  cipherKey: Buffer;
  cipherIv: Buffer;
  encryptionInfo: EncryptionInfo;
}

export interface PreparedInvoicePayload {
  invoiceHash: string;
  invoiceSize: number;
  encryptedInvoiceHash: string;
  encryptedInvoiceSize: number;
  encryptedInvoiceContent: string;
}

export class CryptographyService {
  static generateAesKey(): Buffer {
    return crypto.randomBytes(32);
  }

  static generateIv(): Buffer {
    return crypto.randomBytes(16);
  }

  static sha256Base64(data: Buffer | string): string {
    const hash = crypto.createHash("sha256").update(data).digest("base64");
    return hash;
  }

  static sha256Base64Url(data: Buffer | string): string {
    const hash = crypto.createHash("sha256").update(data).digest();
    return toBase64Url(hash);
  }

  static encryptAes256Cbc(data: Buffer, key: Buffer, iv: Buffer): Buffer {
    const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
    return Buffer.concat([cipher.update(data), cipher.final()]);
  }

  static decryptAes256Cbc(data: Buffer, key: Buffer, iv: Buffer): Buffer {
    const cipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    return Buffer.concat([cipher.update(data), cipher.final()]);
  }

  static encryptRsaOaepSha256(data: Buffer, publicKeyPem: string): Buffer {
    return crypto.publicEncrypt(
      {
        key: publicKeyPem,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      data,
    );
  }

  static encryptKsefTokenRsa(
    token: string,
    timestampMs: number,
    publicCertificate: string,
  ): Buffer {
    const payload = Buffer.from(`${token.trim()}|${timestampMs}`, "utf8");
    const publicKeyPem = CryptographyService.normalizeCertificatePem(publicCertificate);
    return CryptographyService.encryptRsaOaepSha256(payload, publicKeyPem);
  }

  static encryptKsefTokenEc(
    token: string,
    timestampMs: number,
    publicCertificate: string,
    outputFormat: "java" | "csharp" = "java",
  ): Buffer {
    const payload = Buffer.from(`${token.trim()}|${timestampMs}`, "utf8");
    const publicKeyPem = CryptographyService.normalizeCertificatePem(publicCertificate);
    const publicKey = crypto.createPublicKey(publicKeyPem);
    const { privateKey, publicKey: ephemeralPublicKey } = crypto.generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
    });
    const sharedSecret = crypto.diffieHellman({
      privateKey,
      publicKey,
    });
    const aesKey = sharedSecret.subarray(0, 32);
    const nonce = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", aesKey, nonce);
    const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
    const tag = cipher.getAuthTag();
    const spki = ephemeralPublicKey.export({ type: "spki", format: "der" });
    if (outputFormat === "csharp") {
      return Buffer.concat([spki, nonce, tag, ciphertext]);
    }
    return Buffer.concat([spki, nonce, ciphertext, tag]);
  }

  static encryptKsefToken(
    token: string,
    timestampMs: number,
    publicCertificate: string,
    method: "rsa" | "ec" = "rsa",
    ecOutputFormat: "java" | "csharp" = "java",
  ): string {
    const encrypted =
      method === "ec"
        ? CryptographyService.encryptKsefTokenEc(
            token,
            timestampMs,
            publicCertificate,
            ecOutputFormat,
          )
        : CryptographyService.encryptKsefTokenRsa(token, timestampMs, publicCertificate);
    return encrypted.toString("base64");
  }

  static toPemFromBase64Der(base64Der: string, label = "CERTIFICATE"): string {
    const chunked = base64Der.match(/.{1,64}/g)?.join("\n") ?? base64Der;
    return `-----BEGIN ${label}-----\n${chunked}\n-----END ${label}-----\n`;
  }

  static normalizeCertificatePem(certificate: string): string {
    if (certificate.includes("BEGIN ")) {
      const trimmed = certificate.trim();
      return certificate.endsWith("\n") ? certificate : `${trimmed}\n`;
    }
    return CryptographyService.toPemFromBase64Der(certificate);
  }

  static getMetaData(data: Buffer | Uint8Array): FileMetadata {
    const buffer = Buffer.from(data);
    return {
      hashSha256Base64: CryptographyService.sha256Base64(buffer),
      fileSize: buffer.length,
    };
  }

  static getEncryptionData(publicCertBase64Der: string): EncryptionData {
    const cipherKey = CryptographyService.generateAesKey();
    const cipherIv = CryptographyService.generateIv();
    const pem = CryptographyService.toPemFromBase64Der(publicCertBase64Der);
    const encryptedKey = CryptographyService.encryptRsaOaepSha256(cipherKey, pem);

    return {
      cipherKey,
      cipherIv,
      encryptionInfo: {
        encryptedSymmetricKey: encryptedKey.toString("base64"),
        initializationVector: cipherIv.toString("base64"),
      },
    };
  }

  static prepareInvoicePayload(
    invoiceXml: Buffer,
    cipherKey: Buffer,
    cipherIv: Buffer,
  ): PreparedInvoicePayload {
    const encrypted = CryptographyService.encryptAes256Cbc(invoiceXml, cipherKey, cipherIv);
    return {
      invoiceHash: CryptographyService.sha256Base64(invoiceXml),
      invoiceSize: invoiceXml.length,
      encryptedInvoiceHash: CryptographyService.sha256Base64(encrypted),
      encryptedInvoiceSize: encrypted.length,
      encryptedInvoiceContent: encrypted.toString("base64"),
    };
  }
}
