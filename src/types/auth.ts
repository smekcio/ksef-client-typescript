import { AuthorizationPolicy, ContextIdentifier, JsonObject, TokenInfo } from "./common";

export interface AuthChallengeResponse {
  challenge: string;
  timestamp: string;
  timestampMs?: number;
}

export interface InitTokenAuthenticationRequest {
  challenge: string;
  contextIdentifier: ContextIdentifier;
  encryptedToken: string;
  authorizationPolicy?: AuthorizationPolicy | null;
}

export interface InitXadesAuthenticationRequest {
  signedXml: string;
}

export interface RefreshTokenResponse {
  accessToken: TokenInfo;
}

export interface AuthTokenRequestContextIdentifier {
  type: string;
  value: string;
}

export interface AuthTokenRequest {
  challenge: string;
  contextIdentifier: AuthTokenRequestContextIdentifier;
  encryptedToken: string;
  authorizationPolicy?: AuthorizationPolicy | null;
}

export interface AuthXadesRequest {
  signedXml: string;
}

export interface AuthTokenRedeemResponse {
  accessToken: TokenInfo;
  refreshToken: TokenInfo;
}

export type AuthAnyResponse = JsonObject;
