import { BaseClient } from "../client/baseClient";
import { HttpClient } from "../client/httpClient";
import { LighthouseMessage, LighthouseStatusResponse } from "../types/lighthouse";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export class LighthouseClient extends BaseClient {
  private readonly baseUrl: string;

  constructor(http: HttpClient, baseUrl: string) {
    super(http);
    this.baseUrl = trimTrailingSlash(baseUrl);
  }

  async getStatus(): Promise<LighthouseStatusResponse> {
    return this.http.request<LighthouseStatusResponse>({
      method: "GET",
      path: `${this.requireBaseUrl()}/status`,
    });
  }

  async getMessages(): Promise<LighthouseMessage[]> {
    return this.http.request<LighthouseMessage[]>({
      method: "GET",
      path: `${this.requireBaseUrl()}/messages`,
    });
  }

  private requireBaseUrl(): string {
    if (this.baseUrl.length > 0) {
      return this.baseUrl;
    }
    throw new Error("Lighthouse base URL is missing.");
  }
}
