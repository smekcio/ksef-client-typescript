import { BaseClient } from "../client/baseClient";
import { PublicKeyCertificate } from "../types/security";

export class SecurityClient extends BaseClient {
  async getPublicKeyCertificates(): Promise<PublicKeyCertificate[]> {
    return this.http.request<PublicKeyCertificate[]>({
      method: "GET",
      path: "/security/public-key-certificates",
      responseType: "json",
    });
  }
}
