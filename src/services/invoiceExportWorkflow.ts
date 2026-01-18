import { InvoicesClient } from "../api/invoicesClient";
import { SecurityClient } from "../api/securityClient";
import { HttpClient } from "../client/httpClient";
import { CryptographyService, EncryptionData } from "../crypto/cryptographyService";
import { KsefError } from "../errors/errors";
import {
  InvoiceExportRequest,
  InvoiceExportStatusResponse,
  InvoicePackagePart,
  InvoiceQueryFilters,
} from "../types/invoices";
import { StatusInfo } from "../types/common";
import { unzip } from "../utils/zip";

export interface ExportStartOptions {
  filters: InvoiceQueryFilters;
  encryptionData?: EncryptionData;
  publicCertificateBase64Der?: string;
}

export interface ExportResult {
  referenceNumber: string;
  encryptionData: EncryptionData;
}

export interface PackageProcessingResult {
  metadataSummaries: Array<Record<string, unknown>>;
  invoiceXmlFiles: Record<string, string>;
}

export interface WaitForExportOptions {
  pollIntervalMs?: number;
  maxAttempts?: number;
}

export interface DownloadPackageOptions {
  verifyHashes?: boolean;
}

export class InvoiceExportWorkflow {
  private readonly invoicesClient: InvoicesClient;
  private readonly securityClient: SecurityClient;
  private readonly http: HttpClient;

  constructor(invoicesClient: InvoicesClient, securityClient: SecurityClient, http: HttpClient) {
    this.invoicesClient = invoicesClient;
    this.securityClient = securityClient;
    this.http = http;
  }

  async startExport(options: ExportStartOptions): Promise<ExportResult> {
    const encryptionData =
      options.encryptionData ??
      (await this.buildEncryptionData(options.publicCertificateBase64Der));
    const request: InvoiceExportRequest = {
      encryption: encryptionData.encryptionInfo,
      filters: options.filters,
    };
    const response = await this.invoicesClient.exportInvoices(request);
    return {
      referenceNumber: response.referenceNumber,
      encryptionData,
    };
  }

  async waitForExport(
    referenceNumber: string,
    options: WaitForExportOptions = {},
  ): Promise<InvoiceExportStatusResponse> {
    const pollIntervalMs = options.pollIntervalMs ?? 2000;
    const maxAttempts = options.maxAttempts ?? 60;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const status = await this.invoicesClient.getInvoiceExportStatus(referenceNumber);
      const statusInfo = status.status ?? ({} as StatusInfo);
      if (statusInfo.code === 200) {
        return status;
      }
      if (statusInfo.code !== 100) {
        const details = statusInfo.details?.length
          ? ` Details: ${statusInfo.details.join(", ")}`
          : "";
        throw new KsefError(
          `Export failed: ${statusInfo.code} ${statusInfo.description}${details}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
    throw new KsefError("Export did not complete within max attempts.");
  }

  async downloadAndProcessPackage(
    status: InvoiceExportStatusResponse,
    encryptionData: EncryptionData,
    options: DownloadPackageOptions = {},
  ): Promise<PackageProcessingResult> {
    const parts = status.package?.parts ?? [];
    const encryptedParts = await this.downloadParts(parts, options.verifyHashes);
    const decryptedParts = encryptedParts.map((part) =>
      CryptographyService.decryptAes256Cbc(part, encryptionData.cipherKey, encryptionData.cipherIv),
    );
    const archiveBytes = Buffer.concat(decryptedParts);
    const entries = await unzip(archiveBytes);

    const metadataSummaries: Array<Record<string, unknown>> = [];
    const invoiceXmlFiles: Record<string, string> = {};

    for (const [name, content] of entries.entries()) {
      if (name.toLowerCase() === "_metadata.json") {
        const parsed = JSON.parse(content.toString("utf8"));
        const invoices = parsed?.invoices ?? parsed?.invoiceList ?? [];
        if (Array.isArray(invoices)) {
          metadataSummaries.push(...(invoices as Array<Record<string, unknown>>));
        }
      } else if (name.toLowerCase().endsWith(".xml")) {
        invoiceXmlFiles[name] = content.toString("utf8");
      }
    }

    return { metadataSummaries, invoiceXmlFiles };
  }

  private async downloadParts(
    parts: InvoicePackagePart[],
    verifyHashes = false,
  ): Promise<Buffer[]> {
    const results: Buffer[] = [];
    for (const part of parts) {
      const data = await this.http.request<Buffer>({
        method: part.method as "GET",
        path: part.url,
        responseType: "buffer",
      });
      if (verifyHashes) {
        const hash = CryptographyService.sha256Base64(data);
        if (hash !== part.encryptedPartHash) {
          throw new KsefError(
            `Encrypted part hash mismatch for ${part.partName}: expected ${part.encryptedPartHash}, got ${hash}.`,
          );
        }
      }
      results.push(data);
    }
    return results;
  }

  private async buildEncryptionData(publicCertificateBase64Der?: string): Promise<EncryptionData> {
    if (publicCertificateBase64Der) {
      return CryptographyService.getEncryptionData(publicCertificateBase64Der);
    }
    const cert = await this.getCertificateByUsage("SymmetricKeyEncryption");
    return CryptographyService.getEncryptionData(cert);
  }

  private async getCertificateByUsage(
    usage: "KsefTokenEncryption" | "SymmetricKeyEncryption",
  ): Promise<string> {
    const certificates = await this.securityClient.getPublicKeyCertificates();
    const cert = certificates.find((item) => item.usage.includes(usage));
    if (!cert) {
      throw new KsefError(`No public certificate found for usage ${usage}.`);
    }
    return cert.certificate;
  }
}
