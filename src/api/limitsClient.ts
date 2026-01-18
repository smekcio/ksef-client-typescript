import { BaseClient } from "../client/baseClient";
import {
  LimitsChangeRequest,
  LimitsContextResponse,
  LimitsSubjectResponse,
  RateLimitsResponse,
} from "../types/limits";

export class LimitsClient extends BaseClient {
  async getContextLimits(): Promise<LimitsContextResponse> {
    const token = await this.getAccessToken();
    return this.http.request<LimitsContextResponse>({
      method: "GET",
      path: "/limits/context",
      authToken: token,
    });
  }

  async getSubjectLimits(): Promise<LimitsSubjectResponse> {
    const token = await this.getAccessToken();
    return this.http.request<LimitsSubjectResponse>({
      method: "GET",
      path: "/limits/subject",
      authToken: token,
    });
  }

  async getRateLimits(): Promise<RateLimitsResponse> {
    const token = await this.getAccessToken();
    return this.http.request<RateLimitsResponse>({
      method: "GET",
      path: "/rate-limits",
      authToken: token,
    });
  }

  async changeContextSessionLimits(request: LimitsChangeRequest): Promise<void> {
    const token = await this.getAccessToken();
    await this.http.request<void>({
      method: "POST",
      path: "/testdata/limits/context/session",
      body: request,
      authToken: token,
    });
  }

  async restoreContextSessionLimits(): Promise<void> {
    const token = await this.getAccessToken();
    await this.http.request<void>({
      method: "DELETE",
      path: "/testdata/limits/context/session",
      authToken: token,
    });
  }

  async changeSubjectCertificateLimits(request: LimitsChangeRequest): Promise<void> {
    const token = await this.getAccessToken();
    await this.http.request<void>({
      method: "POST",
      path: "/testdata/limits/subject/certificate",
      body: request,
      authToken: token,
    });
  }

  async restoreSubjectCertificateLimits(): Promise<void> {
    const token = await this.getAccessToken();
    await this.http.request<void>({
      method: "DELETE",
      path: "/testdata/limits/subject/certificate",
      authToken: token,
    });
  }

  async changeRateLimits(request: LimitsChangeRequest): Promise<void> {
    const token = await this.getAccessToken();
    await this.http.request<void>({
      method: "POST",
      path: "/testdata/rate-limits",
      body: request,
      authToken: token,
    });
  }

  async restoreRateLimits(): Promise<void> {
    const token = await this.getAccessToken();
    await this.http.request<void>({
      method: "DELETE",
      path: "/testdata/rate-limits",
      authToken: token,
    });
  }

  async setRateLimitsProduction(request: LimitsChangeRequest): Promise<void> {
    const token = await this.getAccessToken();
    await this.http.request<void>({
      method: "POST",
      path: "/testdata/rate-limits/production",
      body: request,
      authToken: token,
    });
  }
}
