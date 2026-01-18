import { BaseClient } from "../client/baseClient";
import {
  CertificateEnrollmentRequest,
  CertificateEnrollmentResponse,
  CertificateEnrollmentStatusResponse,
  CertificateLimitsResponse,
  CertificateRevokeRequest,
  CertificatesQueryRequest,
  CertificatesQueryResponse,
  CertificatesRetrieveRequest,
  CertificatesRetrieveResponse,
} from "../types/certificates";

export class CertificatesClient extends BaseClient {
  async getCertificateLimits(): Promise<CertificateLimitsResponse> {
    const token = await this.getAccessToken();
    return this.http.request<CertificateLimitsResponse>({
      method: "GET",
      path: "/certificates/limits",
      authToken: token,
    });
  }

  async getEnrollmentData(): Promise<Record<string, unknown>> {
    const token = await this.getAccessToken();
    return this.http.request<Record<string, unknown>>({
      method: "GET",
      path: "/certificates/enrollments/data",
      authToken: token,
    });
  }

  async createEnrollment(
    request: CertificateEnrollmentRequest,
  ): Promise<CertificateEnrollmentResponse> {
    const token = await this.getAccessToken();
    return this.http.request<CertificateEnrollmentResponse>({
      method: "POST",
      path: "/certificates/enrollments",
      body: request,
      authToken: token,
    });
  }

  async getEnrollmentStatus(referenceNumber: string): Promise<CertificateEnrollmentStatusResponse> {
    const token = await this.getAccessToken();
    return this.http.request<CertificateEnrollmentStatusResponse>({
      method: "GET",
      path: `/certificates/enrollments/${encodeURIComponent(referenceNumber)}`,
      authToken: token,
    });
  }

  async queryCertificates(request: CertificatesQueryRequest): Promise<CertificatesQueryResponse> {
    const token = await this.getAccessToken();
    return this.http.request<CertificatesQueryResponse>({
      method: "POST",
      path: "/certificates/query",
      body: request,
      authToken: token,
    });
  }

  async retrieveCertificates(
    request: CertificatesRetrieveRequest,
  ): Promise<CertificatesRetrieveResponse> {
    const token = await this.getAccessToken();
    return this.http.request<CertificatesRetrieveResponse>({
      method: "POST",
      path: "/certificates/retrieve",
      body: request,
      authToken: token,
    });
  }

  async revokeCertificate(
    certificateSerialNumber: string,
    request?: CertificateRevokeRequest,
  ): Promise<void> {
    const token = await this.getAccessToken();
    await this.http.request<void>({
      method: "POST",
      path: `/certificates/${encodeURIComponent(certificateSerialNumber)}/revoke`,
      body: request ?? {},
      authToken: token,
    });
  }
}
