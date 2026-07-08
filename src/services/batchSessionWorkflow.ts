import { SessionsClient } from "../api/sessionsClient";
import { SecurityClient } from "../api/securityClient";
import { HttpClient } from "../client/httpClient";
import { CryptographyService, EncryptionData } from "../crypto/cryptographyService";
import { KsefError, KsefValidationError } from "../errors/errors";
import { BatchSessionFormCode, StatusInfo } from "../types/common";
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
  formCode: BatchSessionFormCode;
  invoices?: BatchInvoiceInput[];
  zipBytes?: Buffer;
  publicCertificateBase64Der?: string;
  offlineMode?: boolean;
  upoV43?: boolean;
  parallelism?: number;
  maxPartSizeBytes?: number;
}

export interface BatchSessionState {
  referenceNumber: string;
  encryptionData: EncryptionData;
  batchFile: {
    fileSize: number;
    fileHash: string;
    fileParts: Array<{
      ordinalNumber: number;
      fileSize: number;
      fileHash: string;
    }>;
  };
  partUploadRequests: PartUploadRequest[];
  encryptedPartsBase64: string[];
  upoV43?: boolean;
  offlineMode?: boolean;
}

export interface BatchUploadOptions {
  parallelism?: number;
  skipOrdinals?: number[];
  progressCallback?: (ordinalNumber: number) => void | Promise<void>;
}

export class BatchSessionHandle {
  readonly referenceNumber: string;
  readonly encryptionData: EncryptionData;
  readonly upoV43: boolean;
  readonly offlineMode: boolean | undefined;
  readonly batchFile: {
    fileSize: number;
    fileHash: string;
    fileParts: Array<{
      ordinalNumber: number;
      fileSize: number;
      fileHash: string;
    }>;
  };
  private readonly sessionsClient: SessionsClient;
  private readonly http: HttpClient;
  private readonly partUploadRequests: PartUploadRequest[];
  private readonly encryptedParts: Buffer[];

  constructor(
    referenceNumber: string,
    encryptionData: EncryptionData,
    sessionsClient: SessionsClient,
    http: HttpClient,
    batchFile = { fileSize: 0, fileHash: "", fileParts: [] as Array<{ ordinalNumber: number; fileSize: number; fileHash: string }> },
    partUploadRequests: PartUploadRequest[] = [],
    encryptedParts: Buffer[] = [],
    upoV43 = false,
    offlineMode?: boolean,
  ) {
    this.referenceNumber = referenceNumber;
    this.encryptionData = encryptionData;
    this.sessionsClient = sessionsClient;
    this.http = http;
    this.batchFile = batchFile;
    this.partUploadRequests = partUploadRequests;
    this.encryptedParts = encryptedParts;
    this.upoV43 = upoV43;
    this.offlineMode = offlineMode;
  }

  getState(): BatchSessionState {
    return {
      referenceNumber: this.referenceNumber,
      encryptionData: {
        cipherKey: Buffer.from(this.encryptionData.cipherKey),
        cipherIv: Buffer.from(this.encryptionData.cipherIv),
        encryptionInfo: { ...this.encryptionData.encryptionInfo },
      },
      batchFile: {
        fileSize: this.batchFile.fileSize,
        fileHash: this.batchFile.fileHash,
        fileParts: this.batchFile.fileParts.map((part) => ({ ...part })),
      },
      partUploadRequests: this.partUploadRequests.map((part) => ({
        ...part,
        headers: { ...(part.headers ?? {}) },
      })),
      encryptedPartsBase64: this.encryptedParts.map((part) => part.toString("base64")),
      upoV43: this.upoV43,
      ...(this.offlineMode !== undefined ? { offlineMode: this.offlineMode } : {}),
    };
  }

  async status(): Promise<SessionStatusResponse> {
    return await this.sessionsClient.getSessionStatus(this.referenceNumber);
  }

  async uploadParts(parallelismOrOptions: number | BatchUploadOptions = 1): Promise<void> {
    const options =
      typeof parallelismOrOptions === "number"
        ? { parallelism: parallelismOrOptions }
        : parallelismOrOptions;
    await uploadParts(this.http, this.partUploadRequests, this.encryptedParts, {
      parallelism: options.parallelism ?? 1,
      skipOrdinals: options.skipOrdinals ?? [],
      ...(options.progressCallback ? { progressCallback: options.progressCallback } : {}),
    });
  }

  async close(): Promise<void> {
    await this.sessionsClient.closeBatchSession(this.referenceNumber);
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

  async listFailedInvoices(
    pageSize?: number,
    continuationToken?: string,
  ): Promise<Record<string, unknown>> {
    return await this.sessionsClient.getSessionFailedInvoices(
      this.referenceNumber,
      pageSize,
      continuationToken,
    );
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

  async open(options: BatchSessionOpenOptions): Promise<BatchSessionHandle> {
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

    return new BatchSessionHandle(
      response.referenceNumber,
      encryption,
      this.sessionsClient,
      this.http,
      batchFile,
      response.partUploadRequests,
      encryptedParts,
      Boolean(options.upoV43),
      options.offlineMode,
    );
  }

  async openUploadAndClose(options: BatchSessionOpenOptions): Promise<BatchSessionHandle> {
    const handle = await this.open(options);
    await handle.uploadParts(options.parallelism ?? 1);
    await handle.close();
    return handle;
  }

  async resume(state: BatchSessionState, options: { zipBytes: Buffer }): Promise<BatchSessionHandle> {
    if (!state || typeof state.referenceNumber !== "string" || !state.referenceNumber.trim()) {
      throw new KsefValidationError("Batch session state requires non-empty referenceNumber.");
    }
    if (!options?.zipBytes || options.zipBytes.length === 0) {
      throw new KsefValidationError("Batch session resume requires zipBytes.");
    }
    validateEncryptionData(state.encryptionData);
    const resolvedBatchFile = state.batchFile;
    if (!resolvedBatchFile || typeof resolvedBatchFile.fileHash !== "string") {
      throw new KsefValidationError("Batch session state requires batchFile metadata.");
    }
    const zipHash = CryptographyService.sha256Base64(options.zipBytes);
    if (zipHash !== resolvedBatchFile.fileHash) {
      throw new KsefValidationError("Batch session resume zipBytes hash does not match saved state.");
    }
    if (options.zipBytes.length !== resolvedBatchFile.fileSize) {
      throw new KsefValidationError("Batch session resume zipBytes size does not match saved state.");
    }

    let encryptedParts: Buffer[] = [];
    if (Array.isArray(state.encryptedPartsBase64) && state.encryptedPartsBase64.length > 0) {
      encryptedParts = state.encryptedPartsBase64.map((part) => Buffer.from(part, "base64"));
    } else {
      const partSizes = resolvedBatchFile.fileParts
        .map((part) => part.fileSize)
        .filter((size) => Number.isInteger(size) && size > 0);
      const maxPartSizeBytes =
        partSizes.length > 0 ? Math.max(...partSizes) : MAX_BATCH_PART_SIZE_BYTES;
      const parts = splitBuffer(options.zipBytes, maxPartSizeBytes);
      encryptedParts = parts.map((part) =>
        CryptographyService.encryptAes256Cbc(part, state.encryptionData.cipherKey, state.encryptionData.cipherIv),
      );
    }

    return new BatchSessionHandle(
      state.referenceNumber,
      state.encryptionData,
      this.sessionsClient,
      this.http,
      resolvedBatchFile,
      state.partUploadRequests ?? [],
      encryptedParts,
      Boolean(state.upoV43),
      state.offlineMode,
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

function validateEncryptionData(value: EncryptionData): void {
  const hasKey = Buffer.isBuffer(value?.cipherKey) && value.cipherKey.length > 0;
  const hasIv = Buffer.isBuffer(value?.cipherIv) && value.cipherIv.length > 0;
  if (!hasKey || !hasIv) {
    throw new KsefValidationError("Batch session state requires cipherKey and cipherIv.");
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
  options: {
    parallelism: number;
    skipOrdinals: number[];
    progressCallback?: (ordinalNumber: number) => void | Promise<void>;
  },
): Promise<void> {
  const sortedRequests = [...partUploadRequests].sort((a, b) => a.ordinalNumber - b.ordinalNumber);
  if (sortedRequests.length !== parts.length) {
    throw new KsefValidationError("parts length must match partUploadRequests length.");
  }

  const partByOrdinal = new Map<number, Buffer>();
  for (const [index, request] of sortedRequests.entries()) {
    const part = parts[index];
    if (!part) {
      throw new KsefValidationError(`Missing batch part at index ${index}.`);
    }
    partByOrdinal.set(request.ordinalNumber, part);
  }

  const skip = new Set<number>(options.skipOrdinals);
  const activeRequests = sortedRequests.filter((request) => !skip.has(request.ordinalNumber));
  const tasks = activeRequests.map((request) => async () => {
    const part = partByOrdinal.get(request.ordinalNumber);
    if (!part) {
      throw new KsefValidationError(`Missing batch part for ordinal ${request.ordinalNumber}.`);
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
    if (options.progressCallback) {
      await options.progressCallback(request.ordinalNumber);
    }
  });

  await runWithConcurrency(tasks, options.parallelism);
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
