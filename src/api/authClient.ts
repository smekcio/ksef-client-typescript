import { BaseClient } from "../client/baseClient";
import {
  AuthChallengeResponse,
  AuthTokenRedeemResponse,
  InitTokenAuthenticationRequest,
  RefreshTokenResponse,
} from "../types/auth";
import { AuthenticationInitResponse, AuthenticationOperationStatusResponse } from "../types/common";
import { normalizeAuthenticationOperationStatusResponse } from "../utils/authenticationMethodInfo";

export class AuthClient extends BaseClient {
  async getChallenge(): Promise<AuthChallengeResponse> {
    return this.http.request<AuthChallengeResponse>({
      method: "POST",
      path: "/auth/challenge",
    });
  }

  async authenticateWithKsefToken(
    request: InitTokenAuthenticationRequest,
  ): Promise<AuthenticationInitResponse> {
    return this.http.request<AuthenticationInitResponse>({
      method: "POST",
      path: "/auth/ksef-token",
      body: request,
    });
  }

  async authenticateWithXadesSignature(
    signedXml: string,
    verifyCertificateChain?: boolean,
    enforceXadesCompliance?: boolean,
  ): Promise<AuthenticationInitResponse> {
    return this.http.request<AuthenticationInitResponse>({
      method: "POST",
      path: "/auth/xades-signature",
      ...(verifyCertificateChain !== undefined && {
        query: { verifyCertificateChain },
      }),
      body: signedXml,
      headers: {
        "Content-Type": "application/xml",
        Accept: "application/json",
        ...(enforceXadesCompliance && {
          "X-KSeF-Feature": "enforce-xades-compliance",
        }),
      },
    });
  }

  async getAuthStatus(
    referenceNumber: string,
    authenticationToken: string,
  ): Promise<AuthenticationOperationStatusResponse> {
    const response = await this.http.request<AuthenticationOperationStatusResponse>({
      method: "GET",
      path: `/auth/${encodeURIComponent(referenceNumber)}`,
      authToken: authenticationToken,
    });
    return normalizeAuthenticationOperationStatusResponse(response);
  }

  async redeemToken(authenticationToken: string): Promise<AuthTokenRedeemResponse> {
    return this.http.request<AuthTokenRedeemResponse>({
      method: "POST",
      path: "/auth/token/redeem",
      authToken: authenticationToken,
    });
  }

  async refreshAccessToken(refreshToken: string): Promise<RefreshTokenResponse> {
    return this.http.request<RefreshTokenResponse>({
      method: "POST",
      path: "/auth/token/refresh",
      authToken: refreshToken,
    });
  }
}
