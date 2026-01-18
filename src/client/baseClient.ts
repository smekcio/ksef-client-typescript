import { KsefSessionExpiredError } from "../errors/errors";
import { HttpClient } from "./httpClient";

export class BaseClient {
  protected readonly http: HttpClient;
  protected readonly accessTokenProvider: (() => Promise<string | null>) | undefined;

  constructor(http: HttpClient, accessTokenProvider?: () => Promise<string | null>) {
    this.http = http;
    this.accessTokenProvider = accessTokenProvider;
  }

  protected async getAccessToken(): Promise<string> {
    if (!this.accessTokenProvider) {
      throw new KsefSessionExpiredError("Access token provider is missing.");
    }
    const token = await this.accessTokenProvider();
    if (!token) {
      throw new KsefSessionExpiredError("Access token is missing.");
    }
    return token;
  }
}
