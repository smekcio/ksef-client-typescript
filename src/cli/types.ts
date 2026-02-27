import type {
  ContextIdentifier,
  KsefEnvironment,
  KsefLighthouseEnvironment,
  JsonValue,
} from "../index";

export type TokenStorePolicy = "plaintext" | "env";

export interface TokenStoreConfig {
  policy: TokenStorePolicy;
  filePath?: string;
  accessTokenEnvVar?: string;
  refreshTokenEnvVar?: string;
  ksefTokenEnvVar?: string;
}

export interface ProfileConfig {
  environment?: KsefEnvironment;
  baseUrl?: string;
  lighthouseEnvironment?: KsefLighthouseEnvironment;
  context?: ContextIdentifier;
  tokenStore?: TokenStoreConfig;
}

export interface CliConfigFile {
  version: 1;
  currentProfile: string;
  profiles: Record<string, ProfileConfig>;
}

export interface StoredTokens {
  accessToken: string;
  accessTokenValidUntil?: string;
  refreshToken?: string;
  refreshTokenValidUntil?: string;
  updatedAt: string;
}

export interface TokenStoreFile {
  version: 1;
  profiles: Record<string, StoredTokens>;
}

export type CliJson = JsonValue;

export interface CliEnv {
  [key: string]: string | undefined;
}
