import { SessionsClient } from "../api/sessionsClient";
import { SecurityClient } from "../api/securityClient";
import { HttpClient } from "../client/httpClient";
import { CryptographyService, EncryptionData } from "../crypto/cryptographyService";
import { KsefError, KsefValidationError } from "../errors/errors";
import { FormCode, StatusInfo } from "../types/common";
import { PartUploadRequest, SessionStatusResponse } from "../types/sessions";
import { serializeInvoiceXml, InvoiceXmlInput } from "../xml/invoice";
import { parseUpoXml, UpoPotwierdzenie } from "../xml/upo";
import { createZip } from "../utils/zip";
import { splitBuffer } from "../utils/buffer";
import { WaitForUpoOptions } from "./upo";

export const MAX_BATCH_PART_SIZE_BYTES = 100 * 1024 * 1024;

export interface BatchInvoiceInput {
  fileName: string;
  invoice: InvoiceXmlInput;
}

export interface BatchSessionOpenOptions {
  formCode: FormCode;
  invoices?: BatchInvoiceInput[];
  zipBytes?: Buffer;
  publicCertificateBase64Der?: string;
  offlineMode?: boolean;
  upoV43?: boolean;
  parallelism?: number;
  maxPartSizeBytes?: number;
}

export class BatchSessionHandle {
  readonly referenceNumber: string;
  readonly encryptionData: EncryptionData;
  private readonly sessionsClient: SessionsClient;
  private readonly http: HttpClient;

  constructor(
    referenceNumber: string,
    encryptionData: EncryptionData,
    sessionsClient: SessionsClient,
    http: HttpClient,
  ) {
    this.referenceNumber = referenceNumber;
    this.encryptionData = encryptionData;
    this.sessionsClient = sessionsClient;
    this.http = http;
  }

  async status(): Promise<SessionStatusResponse> {
    return await this.sessionsClient.getSessionStatus(this.referenceNumber);
  }

  async waitForUpo(options: WaitForUpoOptions = {}): Promise<string | null> {
    const pollIntervalMs = options.pollIntervalMs ?? 2000;
    const maxAttempts = options.maxAttempts ?? 120;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const status = await this.status();
      const statusInfo = status.status ?? ({} as StatusInfo);
      const page = status.upo?.pages?.[0];
      if (statusInfo.code === 200 && page) {
        return await this.http.request<string>({
          method: "GET",
          path: page.downloadUrl,
          responseType: "text",
        });
      }
      if (statusInfo.code !== 100 && statusInfo.code !== 200) {
        const details = statusInfo.details?.length
          ? ` Details: ${statusInfo.details.join(", ")}`
          : "";
        throw new KsefError(
          `Session failed: ${statusInfo.code} ${statusInfo.description}${details}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
    return null;
  }

  async waitForUpoParsed(options: WaitForUpoOptions = {}): Promise<UpoPotwierdzenie | null> {
    const xml = await this.waitForUpo(options);
    if (!xml) {
      return null;
    }
    return parseUpoXml(xml);
  }
}

export class BatchSessionWorkflow {
  private readonly sessionsClient: SessionsClient;
  private readonly securityClient: SecurityClient;
  private readonly http: HttpClient;

  constructor(sessionsClient: SessionsClient, securityClient: SecurityClient, http: HttpClient) {
    this.sessionsClient = sessionsClient;
    this.securityClient = securityClient;
    this.http = http;
  }

  async openUploadAndClose(options: BatchSessionOpenOptions): Promise<BatchSessionHandle> {
    if (!options.formCode) {
      throw new KsefValidationError("formCode is required.");
    }

    const zipBytes = await this.resolveZipBytes(options);
    const certificate =
      options.publicCertificateBase64Der ??
      (await this.getCertificateByUsage("SymmetricKeyEncryption"));
    const encryption = CryptographyService.getEncryptionData(certificate);

    const maxPartSizeBytes = options.maxPartSizeBytes ?? MAX_BATCH_PART_SIZE_BYTES;
    const parts = splitBuffer(zipBytes, maxPartSizeBytes);
    const encryptedParts = parts.map((part) =>
      CryptographyService.encryptAes256Cbc(part, encryption.cipherKey, encryption.cipherIv),
    );

    const batchFile = buildBatchFileInfo(zipBytes, encryptedParts);
    const requestPayload = {
      formCode: options.formCode,
      batchFile,
      encryption: encryption.encryptionInfo,
      ...(options.offlineMode !== undefined && { offlineMode: options.offlineMode }),
    };

    const response = await this.sessionsClient.openBatchSession(requestPayload, options.upoV43);

    await uploadParts(
      this.http,
      response.partUploadRequests,
      encryptedParts,
      options.parallelism ?? 1,
    );

    await this.sessionsClient.closeBatchSession(response.referenceNumber);

    return new BatchSessionHandle(
      response.referenceNumber,
      encryption,
      this.sessionsClient,
      this.http,
    );
  }

  private async resolveZipBytes(options: BatchSessionOpenOptions): Promise<Buffer> {
    if (options.zipBytes) {
      return options.zipBytes;
    }
    if (!options.invoices || options.invoices.length === 0) {
      throw new KsefValidationError("Either zipBytes or invoices are required.");
    }
    const entries = options.invoices.map((item) => ({
      fileName: item.fileName,
      content: serializeInvoiceXml(item.invoice),
    }));
    return await createZip(entries);
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

function buildBatchFileInfo(zipBytes: Buffer, encryptedParts: Buffer[]) {
  const zipHash = CryptographyService.sha256Base64(zipBytes);
  const fileParts = encryptedParts.map((part, index) => ({
    ordinalNumber: index + 1,
    fileSize: part.length,
    fileHash: CryptographyService.sha256Base64(part),
  }));
  return {
    fileSize: zipBytes.length,
    fileHash: zipHash,
    fileParts,
  };
}

async function uploadParts(
  http: HttpClient,
  partUploadRequests: PartUploadRequest[],
  parts: Buffer[],
  parallelism: number,
): Promise<void> {
  const sortedRequests = [...partUploadRequests].sort((a, b) => a.ordinalNumber - b.ordinalNumber);
  if (sortedRequests.length !== parts.length) {
    throw new KsefValidationError("parts length must match partUploadRequests length.");
  }

  const tasks = sortedRequests.map((request, index) => async () => {
    const part = parts[index];
    if (!part) {
      throw new KsefValidationError(`Missing batch part at index ${index}.`);
    }
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(request.headers ?? {})) {
      if (value) {
        headers[key] = value;
      }
    }
    await http.request<void>({
      method: request.method as "PUT" | "POST" | "GET" | "DELETE",
      path: request.url,
      headers,
      body: part,
      responseType: "text",
    });
  });

  await runWithConcurrency(tasks, parallelism);
}

async function runWithConcurrency(
  tasks: Array<() => Promise<void>>,
  parallelism: number,
): Promise<void> {
  const limit = Math.max(1, Math.min(parallelism, tasks.length));
  let index = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (index < tasks.length) {
      const current = index;
      index += 1;
      const task = tasks[current];
      if (task) {
        await task();
      }
    }
  });
  await Promise.all(workers);
}
