import { SessionsClient } from "../api/sessionsClient";
import { SecurityClient } from "../api/securityClient";
import { HttpClient } from "../client/httpClient";
import { CryptographyService, EncryptionData } from "../crypto/cryptographyService";
import { KsefError, KsefValidationError } from "../errors/errors";
import { OnlineSessionFormCode, StatusInfo } from "../types/common";
import { SendInvoiceResponse, SessionStatusResponse } from "../types/sessions";
import { serializeInvoiceXml, InvoiceXmlInput } from "../xml/invoice";
import { parseUpoXml, UpoPotwierdzenie } from "../xml/upo";
import { WaitForUpoOptions } from "./upo";

export interface OnlineSessionOpenOptions {
  formCode: OnlineSessionFormCode;
  publicCertificateBase64Der?: string;
  upoV43?: boolean;
}

export interface OnlineInvoiceSendOptions {
  invoice: InvoiceXmlInput;
  offlineMode?: boolean;
  hashOfCorrectedInvoice?: string;
}

export class OnlineSessionHandle {
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

  async sendInvoice(options: OnlineInvoiceSendOptions): Promise<SendInvoiceResponse> {
    const invoiceXml = serializeInvoiceXml(options.invoice);
    const payload = CryptographyService.prepareInvoicePayload(
      invoiceXml,
      this.encryptionData.cipherKey,
      this.encryptionData.cipherIv,
    );
    const request = {
      ...payload,
      ...(options.offlineMode !== undefined && {
        offlineMode: options.offlineMode,
      }),
      ...(options.hashOfCorrectedInvoice && {
        hashOfCorrectedInvoice: options.hashOfCorrectedInvoice,
      }),
    };
    return await this.sessionsClient.sendOnlineInvoice(this.referenceNumber, request);
  }

  async close(): Promise<void> {
    await this.sessionsClient.closeOnlineSession(this.referenceNumber);
  }

  async status(): Promise<SessionStatusResponse> {
    return await this.sessionsClient.getSessionStatus(this.referenceNumber);
  }

  async waitForUpo(options: WaitForUpoOptions = {}): Promise<string | null> {
    const pollIntervalMs = options.pollIntervalMs ?? 2000;
    const maxAttempts = options.maxAttempts ?? 60;
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

export class OnlineSessionWorkflow {
  private readonly sessionsClient: SessionsClient;
  private readonly securityClient: SecurityClient;
  private readonly http: HttpClient;

  constructor(sessionsClient: SessionsClient, securityClient: SecurityClient, http: HttpClient) {
    this.sessionsClient = sessionsClient;
    this.securityClient = securityClient;
    this.http = http;
  }

  async open(options: OnlineSessionOpenOptions): Promise<OnlineSessionHandle> {
    if (!options.formCode) {
      throw new KsefValidationError("formCode is required.");
    }
    const certificate =
      options.publicCertificateBase64Der ??
      (await this.getCertificateByUsage("SymmetricKeyEncryption"));
    const encryption = CryptographyService.getEncryptionData(certificate);
    const response = await this.sessionsClient.openOnlineSession(
      {
        formCode: options.formCode,
        encryption: encryption.encryptionInfo,
      },
      options.upoV43,
    );
    return new OnlineSessionHandle(
      response.referenceNumber,
      encryption,
      this.sessionsClient,
      this.http,
    );
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
