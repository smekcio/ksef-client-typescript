import { AuthClient } from "../api/authClient";
import { KsefSessionExpiredError } from "../errors/errors";
import { AuthenticationTokensResponse } from "../types/common";
import { getJwtExpiryMs } from "../utils/jwt";

export interface AuthManagerOptions {
  refreshLeewayMs?: number;
}

export class AuthManager {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private accessTokenExpiryMs: number | null = null;
  private refreshInFlight: Promise<string> | null = null;
  private readonly refreshLeewayMs: number;
  private readonly authClient: AuthClient;

  constructor(authClient: AuthClient, options?: AuthManagerOptions) {
    this.authClient = authClient;
    this.refreshLeewayMs = options?.refreshLeewayMs ?? 60_000;
  }

  setTokens(tokens: AuthenticationTokensResponse): void {
    this.accessToken = tokens.accessToken.token;
    this.refreshToken = tokens.refreshToken.token;
    this.accessTokenExpiryMs =
      getJwtExpiryMs(tokens.accessToken.token) ?? Date.parse(tokens.accessToken.validUntil);
  }

  setAccessToken(token: string, validUntil?: string): void {
    this.accessToken = token;
    this.accessTokenExpiryMs =
      getJwtExpiryMs(token) ?? (validUntil ? Date.parse(validUntil) : null);
  }

  async getAccessToken(): Promise<string | null> {
    if (!this.accessToken) {
      return null;
    }
    if (!this.accessTokenExpiryMs) {
      return this.accessToken;
    }
    const now = Date.now();
    if (this.accessTokenExpiryMs - now > this.refreshLeewayMs) {
      return this.accessToken;
    }
    return await this.refreshAccessToken();
  }

  private async refreshAccessToken(): Promise<string> {
    const refreshToken = this.refreshToken;
    if (!refreshToken) {
      throw new KsefSessionExpiredError("Refresh token is missing.");
    }
    if (this.refreshInFlight) {
      return await this.refreshInFlight;
    }
    this.refreshInFlight = (async () => {
      const response = await this.authClient.refreshAccessToken(refreshToken);
      this.setAccessToken(response.accessToken.token, response.accessToken.validUntil);
      return this.accessToken ?? response.accessToken.token;
    })();
    try {
      return await this.refreshInFlight;
    } catch {
      this.accessToken = null;
      this.refreshToken = null;
      throw new KsefSessionExpiredError("Failed to refresh access token.");
    } finally {
      this.refreshInFlight = null;
    }
  }
}
