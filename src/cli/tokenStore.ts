import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { CliEnv, ProfileConfig, StoredTokens, TokenStoreFile, TokenStorePolicy } from "./types";

export const TOKENS_FILE_NAME = "tokens.json";
export const DEFAULT_ACCESS_TOKEN_ENV = "KSEF_ACCESS_TOKEN";
export const DEFAULT_REFRESH_TOKEN_ENV = "KSEF_REFRESH_TOKEN";
export const DEFAULT_KSEF_TOKEN_ENV = "KSEF_TOKEN";

export interface ResolvedTokenStore {
  policy: TokenStorePolicy;
  filePath: string;
  accessTokenEnvVar: string;
  refreshTokenEnvVar: string;
  ksefTokenEnvVar: string;
}

export function resolveTokenStore(profile: ProfileConfig, cliHome: string): ResolvedTokenStore {
  const tokenStore = profile.tokenStore;
  return {
    policy: tokenStore?.policy ?? "plaintext",
    filePath: tokenStore?.filePath
      ? path.resolve(tokenStore.filePath)
      : path.join(cliHome, TOKENS_FILE_NAME),
    accessTokenEnvVar: tokenStore?.accessTokenEnvVar ?? DEFAULT_ACCESS_TOKEN_ENV,
    refreshTokenEnvVar: tokenStore?.refreshTokenEnvVar ?? DEFAULT_REFRESH_TOKEN_ENV,
    ksefTokenEnvVar: tokenStore?.ksefTokenEnvVar ?? DEFAULT_KSEF_TOKEN_ENV,
  };
}

export async function loadStoredTokens(
  profileName: string,
  tokenStore: ResolvedTokenStore,
  env: CliEnv,
): Promise<StoredTokens | null> {
  if (tokenStore.policy === "env") {
    const accessToken = env[tokenStore.accessTokenEnvVar]?.trim();
    if (!accessToken) {
      return null;
    }
    const refreshToken = env[tokenStore.refreshTokenEnvVar]?.trim();
    return {
      accessToken,
      ...(refreshToken ? { refreshToken } : {}),
      updatedAt: new Date().toISOString(),
    };
  }

  const file = await readTokenFile(tokenStore.filePath);
  return file.profiles[profileName] ?? null;
}

export async function saveStoredTokens(
  profileName: string,
  tokenStore: ResolvedTokenStore,
  tokens: StoredTokens,
): Promise<boolean> {
  if (tokenStore.policy === "env") {
    return false;
  }

  const file = await readTokenFile(tokenStore.filePath);
  file.profiles[profileName] = tokens;
  await writeTokenFile(tokenStore.filePath, file);
  return true;
}

export async function clearStoredTokens(
  profileName: string,
  tokenStore: ResolvedTokenStore,
): Promise<boolean> {
  if (tokenStore.policy === "env") {
    return false;
  }

  const file = await readTokenFile(tokenStore.filePath);
  if (!(profileName in file.profiles)) {
    return true;
  }
  delete file.profiles[profileName];
  await writeTokenFile(tokenStore.filePath, file);
  return true;
}

export function formatTokenStoreWarning(profileName: string, tokenStore: ResolvedTokenStore): string | null {
  if (tokenStore.policy !== "plaintext") {
    return null;
  }
  return `Warning: profile "${profileName}" stores access tokens in plaintext at ${tokenStore.filePath}.`;
}

async function readTokenFile(filePath: string): Promise<TokenStoreFile> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<TokenStoreFile>;
    if (!parsed || typeof parsed !== "object") {
      return { version: 1, profiles: {} };
    }
    const profiles = parsed.profiles && typeof parsed.profiles === "object" ? parsed.profiles : {};
    return {
      version: 1,
      profiles: profiles as Record<string, StoredTokens>,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: 1, profiles: {} };
    }
    throw error;
  }
}

async function writeTokenFile(filePath: string, data: TokenStoreFile): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}
