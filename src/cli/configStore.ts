import os from "node:os";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { KSEF_ENV_URLS } from "../index";
import type { CliConfigFile, CliEnv, ProfileConfig } from "./types";

export const DEFAULT_PROFILE_NAME = "default";
export const CONFIG_FILE_NAME = "config.json";

export function resolveCliHome(env: CliEnv): string {
  const custom = env.KSEF_CLI_HOME?.trim();
  if (custom) {
    return path.resolve(custom);
  }
  return path.join(os.homedir(), ".ksef-ts");
}

export function getConfigPath(cliHome: string): string {
  return path.join(cliHome, CONFIG_FILE_NAME);
}

export function createDefaultConfig(): CliConfigFile {
  return {
    version: 1,
    currentProfile: DEFAULT_PROFILE_NAME,
    profiles: {
      [DEFAULT_PROFILE_NAME]: {
        environment: "TEST",
        lighthouseEnvironment: "TEST",
        tokenStore: {
          policy: "plaintext",
        },
      },
    },
  };
}

export async function readConfig(cliHome: string): Promise<CliConfigFile> {
  const configPath = getConfigPath(cliHome);
  try {
    const raw = await readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<CliConfigFile>;
    if (!parsed || typeof parsed !== "object") {
      return createDefaultConfig();
    }
    const profiles = parsed.profiles && typeof parsed.profiles === "object" ? parsed.profiles : {};
    const currentProfile =
      typeof parsed.currentProfile === "string" && parsed.currentProfile.length > 0
        ? parsed.currentProfile
        : DEFAULT_PROFILE_NAME;
    return {
      version: 1,
      currentProfile,
      profiles: profiles as Record<string, ProfileConfig>,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return createDefaultConfig();
    }
    throw error;
  }
}

export async function writeConfig(cliHome: string, config: CliConfigFile): Promise<void> {
  const configPath = getConfigPath(cliHome);
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2), "utf8");
}

export function getProfile(config: CliConfigFile, profileName?: string): [string, ProfileConfig] {
  const resolvedName = profileName ?? config.currentProfile;
  const profile = config.profiles[resolvedName];
  if (!profile) {
    throw new Error(`Profile "${resolvedName}" not found.`);
  }
  return [resolvedName, profile];
}

export function resolveBaseUrl(profile: ProfileConfig): string {
  if (profile.baseUrl) {
    return profile.baseUrl;
  }
  const env = profile.environment ?? "TEST";
  return KSEF_ENV_URLS[env];
}
