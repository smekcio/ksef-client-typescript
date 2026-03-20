import path from "node:path";
import { pathToFileURL } from "node:url";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  KsefApiError,
  KsefClient,
  KsefError,
  KSEF_LIGHTHOUSE_URLS,
  KsefSessionExpiredError,
  KsefValidationError,
  parseUpoXml,
  type ContextIdentifier,
  type KsefEnvironment,
  type KsefLighthouseEnvironment,
  type InvoiceQueryFilters,
  type JsonValue,
} from "../index";
import { getBooleanOption, getNumberOption, getStringOption, parseArgv } from "./args";
import {
  createDefaultConfig,
  getConfigPath,
  getProfile,
  readConfig,
  resolveBaseUrl,
  resolveCliHome,
  writeConfig,
} from "./configStore";
import { parseFormCode } from "./formCodes";
import {
  clearStoredTokens,
  formatTokenStoreWarning,
  loadStoredTokens,
  resolveTokenStore,
  saveStoredTokens,
} from "./tokenStore";
import type { CliConfigFile, CliEnv, CliJson, ProfileConfig, StoredTokens } from "./types";

const EXIT_SUCCESS = 0;
const EXIT_USAGE = 2;
const EXIT_CONFIG = 3;
const EXIT_AUTH = 4;
const EXIT_REMOTE = 5;
const EXIT_UNEXPECTED = 1;

interface CliIo {
  stdout: (message: string) => void;
  stderr: (message: string) => void;
}

interface RunCliOptions {
  env?: CliEnv;
  cwd?: string;
  io?: CliIo;
  fetchImpl?: typeof fetch;
}

interface CommandContext {
  env: CliEnv;
  cwd: string;
  cliHome: string;
  json: boolean;
  io: CliIo;
  fetchImpl: typeof fetch;
}

class CliError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = EXIT_USAGE) {
    super(message);
    this.exitCode = exitCode;
    this.name = "CliError";
  }
}

export async function runCli(argv: string[], options: RunCliOptions = {}): Promise<number> {
  const parsed = parseArgv(argv);
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const io: CliIo =
    options.io ??
    {
      stdout: (message: string) => {
        process.stdout.write(`${message}\n`);
      },
      stderr: (message: string) => {
        process.stderr.write(`${message}\n`);
      },
    };

  const context: CommandContext = {
    env,
    cwd,
    cliHome: resolveCliHome(env),
    json: parsed.json,
    io,
    fetchImpl: options.fetchImpl ?? fetch,
  };

  try {
    const [command, ...rest] = parsed.positionals;
    if (!command || parsed.help) {
      emit(context, helpText());
      return EXIT_SUCCESS;
    }

    switch (command) {
      case "init": {
        const result = await runInit(rest, parsed.options, context);
        emit(context, result);
        return EXIT_SUCCESS;
      }
      case "profile": {
        const result = await runProfile(rest, parsed.options, context);
        emit(context, result);
        return EXIT_SUCCESS;
      }
      case "auth": {
        const result = await runAuth(rest, parsed.options, context);
        emit(context, result);
        return EXIT_SUCCESS;
      }
      case "health": {
        const result = await runHealth(parsed.options, context);
        emit(context, result);
        return EXIT_SUCCESS;
      }
      case "lighthouse": {
        const result = await runLighthouse(parsed.options, context);
        emit(context, result);
        return EXIT_SUCCESS;
      }
      case "invoice": {
        const result = await runInvoice(rest, parsed.options, context);
        emit(context, result);
        return EXIT_SUCCESS;
      }
      case "send": {
        const result = await runSend(parsed.options, context);
        emit(context, result);
        return EXIT_SUCCESS;
      }
      case "upo": {
        const result = await runUpo(rest, parsed.options, context);
        emit(context, result);
        return EXIT_SUCCESS;
      }
      case "export": {
        const result = await runExport(parsed.options, context);
        emit(context, result);
        return EXIT_SUCCESS;
      }
      default:
        throw new CliError(`Unknown command "${command}". Use --help to list commands.`, EXIT_USAGE);
    }
  } catch (error) {
    const normalized = normalizeError(error);
    emitError(context, normalized);
    return normalized.exitCode;
  }
}

async function runInit(
  _positionals: string[],
  options: Record<string, string | boolean>,
  context: CommandContext,
): Promise<CliJson> {
  const config = await readConfig(context.cliHome);
  const requestedProfile = getStringOption(options, "profile");
  const profileName = requestedProfile === undefined ? config.currentProfile : requestedProfile;
  const current = config.profiles[profileName] ?? {};
  const updated = applyProfilePatch(current, options);

  config.profiles[profileName] = updated;
  config.currentProfile = profileName;
  await writeConfig(context.cliHome, config);

  const warning = formatTokenStoreWarning(profileName, resolveTokenStore(updated, context.cliHome));
  if (warning) {
    context.io.stderr(warning);
  }

  return {
    ok: true,
    configPath: getConfigPath(context.cliHome),
    profile: profileName,
    activeProfile: config.currentProfile,
    profileConfig: toJsonValue(updated),
  };
}

async function runProfile(
  positionals: string[],
  options: Record<string, string | boolean>,
  context: CommandContext,
): Promise<CliJson> {
  const [subcommand, ...rest] = positionals;
  const config = await readConfig(context.cliHome);

  if (!subcommand || subcommand === "show") {
    const requestedName = rest[0] ?? getStringOption(options, "profile");
    const [profileName, profile] = getProfile(config, requestedName);
    return {
      profile: profileName,
      activeProfile: config.currentProfile,
      configPath: getConfigPath(context.cliHome),
      profileConfig: toJsonValue(profile),
    };
  }

  if (subcommand === "list") {
    const names = Object.keys(config.profiles).sort();
    return {
      profiles: names,
      activeProfile: config.currentProfile,
    };
  }

  if (subcommand === "use") {
    const profileName = rest[0];
    if (!profileName) {
      throw new CliError("profile use requires profile name.");
    }
    if (!config.profiles[profileName]) {
      throw new CliError(`Profile "${profileName}" does not exist.`, EXIT_CONFIG);
    }
    config.currentProfile = profileName;
    await writeConfig(context.cliHome, config);
    return {
      ok: true,
      activeProfile: profileName,
    };
  }

  if (subcommand === "set") {
    const profileName = rest[0];
    if (!profileName) {
      throw new CliError("profile set requires profile name.");
    }
    const current = config.profiles[profileName] ?? {};
    const updated = applyProfilePatch(current, options);
    config.profiles[profileName] = updated;
    await writeConfig(context.cliHome, config);

    const warning = formatTokenStoreWarning(profileName, resolveTokenStore(updated, context.cliHome));
    if (warning) {
      context.io.stderr(warning);
    }

    return {
      ok: true,
      profile: profileName,
      profileConfig: toJsonValue(updated),
    };
  }

  throw new CliError(`Unknown profile subcommand "${subcommand}".`);
}

async function runAuth(
  positionals: string[],
  options: Record<string, string | boolean>,
  context: CommandContext,
): Promise<CliJson> {
  const [subcommand] = positionals;
  if (!subcommand) {
    throw new CliError("auth requires subcommand: login | refresh | status | logout.");
  }

  const loaded = await loadProfileContext(options, context);
  const { profileName, profile } = loaded;
  const tokenStore = resolveTokenStore(profile, context.cliHome);
  const client = createClient(profile);

  if (subcommand === "login") {
    const token =
      getStringOption(options, "token") ?? context.env[tokenStore.ksefTokenEnvVar]?.trim();
    if (!token) {
      throw new CliError(
        `Missing KSeF token. Use --token or set ${tokenStore.ksefTokenEnvVar}.`,
        EXIT_AUTH,
      );
    }

    const contextIdentifier = resolveContextIdentifier(profile, options);
    const tokens = await client.workflows.auth.authenticateWithKsefToken({
      token,
      context: contextIdentifier,
    });

    const stored = await saveStoredTokens(profileName, tokenStore, {
      accessToken: tokens.accessToken.token,
      accessTokenValidUntil: tokens.accessToken.validUntil,
      refreshToken: tokens.refreshToken.token,
      refreshTokenValidUntil: tokens.refreshToken.validUntil,
      updatedAt: new Date().toISOString(),
    });

    const warning = formatTokenStoreWarning(profileName, tokenStore);
    if (warning) {
      context.io.stderr(warning);
    }

    return {
      ok: true,
      profile: profileName,
      tokenStorePolicy: tokenStore.policy,
      stored,
      accessTokenValidUntil: tokens.accessToken.validUntil,
      refreshTokenValidUntil: tokens.refreshToken.validUntil,
      context: toJsonValue(contextIdentifier),
    };
  }

  if (subcommand === "refresh") {
    const stored = await loadStoredTokens(profileName, tokenStore, context.env);
    if (!stored?.refreshToken) {
      throw new CliError("Refresh token not available for this profile.", EXIT_AUTH);
    }

    const refreshed = await client.auth.refreshAccessToken(stored.refreshToken);
    const saved = await saveStoredTokens(profileName, tokenStore, {
      accessToken: refreshed.accessToken.token,
      accessTokenValidUntil: refreshed.accessToken.validUntil,
      refreshToken: stored.refreshToken,
      ...(stored.refreshTokenValidUntil
        ? { refreshTokenValidUntil: stored.refreshTokenValidUntil }
        : {}),
      updatedAt: new Date().toISOString(),
    });

    const warning = formatTokenStoreWarning(profileName, tokenStore);
    if (warning) {
      context.io.stderr(warning);
    }

    return {
      ok: true,
      profile: profileName,
      tokenStorePolicy: tokenStore.policy,
      stored: saved,
      accessTokenValidUntil: refreshed.accessToken.validUntil,
    };
  }

  if (subcommand === "status") {
    const authClient = await createAuthenticatedClient(profileName, profile, context);
    const sessions = await authClient.activeSessions.listActiveSessions(
      getNumberOption(options, "page-size"),
    );
    return {
      ok: true,
      profile: profileName,
      activeSessions: toJsonValue(sessions),
    };
  }

  if (subcommand === "logout") {
    const cleared = await clearStoredTokens(profileName, tokenStore);
    return {
      ok: true,
      profile: profileName,
      tokenStorePolicy: tokenStore.policy,
      cleared,
    };
  }

  throw new CliError(`Unknown auth subcommand "${subcommand}".`);
}

async function runHealth(
  options: Record<string, string | boolean>,
  context: CommandContext,
): Promise<CliJson> {
  const loaded = await loadProfileContext(options, context);
  const client = createClient(loaded.profile);

  const challengeStartedAt = Date.now();
  const challenge = await client.auth.getChallenge();
  const challengeLatencyMs = Date.now() - challengeStartedAt;

  const certStartedAt = Date.now();
  const certificates = await client.security.getPublicKeyCertificates();
  const certLatencyMs = Date.now() - certStartedAt;

  const withAuth = getBooleanOption(options, "with-auth");
  let rateLimits: JsonValue | undefined;

  if (withAuth) {
    const authClient = await createAuthenticatedClient(loaded.profileName, loaded.profile, context);
    rateLimits = toJsonValue(await authClient.limits.getRateLimits());
  }

  return {
    ok: true,
    profile: loaded.profileName,
    baseUrl: resolveBaseUrl(loaded.profile),
    challengeLatencyMs,
    challengeTimestamp: challenge.timestamp,
    publicCertificates: certificates.length,
    certificatesLatencyMs: certLatencyMs,
    ...(rateLimits !== undefined ? { rateLimits } : {}),
  };
}

async function runLighthouse(
  options: Record<string, string | boolean>,
  context: CommandContext,
): Promise<CliJson> {
  const loaded = await loadProfileContext(options, context);
  const environment = resolveLighthouseEnvironment(loaded.profile, options);
  const baseUrl = KSEF_LIGHTHOUSE_URLS[environment];
  const candidates = ["/api/status", "/status", "/api/v1/status"];
  const errors: string[] = [];

  for (const candidate of candidates) {
    const url = `${baseUrl}${candidate}`;
    try {
      const startedAt = Date.now();
      const response = await context.fetchImpl(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });
      const elapsedMs = Date.now() - startedAt;
      if (!response.ok) {
        errors.push(`${url} => HTTP ${response.status}`);
        continue;
      }
      const payload = (await response.json()) as Record<string, JsonValue>;
      return {
        ok: true,
        environment,
        url,
        responseTimeMs: elapsedMs,
        lighthouse: toJsonValue(payload),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${url} => ${message}`);
    }
  }

  throw new CliError(`Failed to query lighthouse endpoint. ${errors.join("; ")}`, EXIT_REMOTE);
}

async function runInvoice(
  positionals: string[],
  options: Record<string, string | boolean>,
  context: CommandContext,
): Promise<CliJson | string> {
  const [subcommand, ...rest] = positionals;
  if (!subcommand) {
    throw new CliError("invoice requires subcommand: get | query.");
  }

  const loaded = await loadProfileContext(options, context);
  const client = await createAuthenticatedClient(loaded.profileName, loaded.profile, context);

  if (subcommand === "get") {
    const ksefNumber = rest[0] ?? getStringOption(options, "ksef-number");
    if (!ksefNumber) {
      throw new CliError("invoice get requires KSeF number.");
    }
    const xml = await client.invoices.getInvoice(ksefNumber);
    const outputFile = getStringOption(options, "output");
    if (outputFile) {
      await writeOutputFile(outputFile, xml, context.cwd);
      return {
        ok: true,
        ksefNumber,
        output: path.resolve(context.cwd, outputFile),
        bytes: Buffer.byteLength(xml, "utf8"),
      };
    }
    return context.json
      ? {
          ksefNumber,
          xml,
        }
      : xml;
  }

  if (subcommand === "query") {
    const filtersFile = getStringOption(options, "filters-file");
    if (!filtersFile) {
      throw new CliError("invoice query requires --filters-file.");
    }
    const filters = await readJsonFile<InvoiceQueryFilters>(filtersFile, context.cwd);
    const metadata = await client.invoices.queryInvoiceMetadata(
      filters,
      getNumberOption(options, "page-offset"),
      getNumberOption(options, "page-size"),
      parseSortOrder(getStringOption(options, "sort-order")),
    );
    return {
      ok: true,
      filtersFile: path.resolve(context.cwd, filtersFile),
      metadata: toJsonValue(metadata),
    };
  }

  throw new CliError(`Unknown invoice subcommand "${subcommand}".`);
}

async function runSend(
  options: Record<string, string | boolean>,
  context: CommandContext,
): Promise<CliJson> {
  const loaded = await loadProfileContext(options, context);
  const client = await createAuthenticatedClient(loaded.profileName, loaded.profile, context);
  const invoiceFile = getStringOption(options, "invoice-file");
  if (!invoiceFile) {
    throw new CliError("send requires --invoice-file.");
  }

  const invoiceXml = await readFile(path.resolve(context.cwd, invoiceFile), "utf8");
  const formCode = parseFormCode(getStringOption(options, "form-code"));
  const waitForUpo = getBooleanOption(options, "wait-upo");
  const pollIntervalMs = getNumberOption(options, "poll-interval-ms");
  const maxAttempts = getNumberOption(options, "max-attempts");
  const hashOfCorrectedInvoice = getStringOption(options, "hash-of-corrected-invoice");

  const session = await client.workflows.sessions.online.open({
    formCode,
    upoV43: getBooleanOption(options, "upo-v43"),
  });
  let closed = false;
  try {
    const sendResponse = await session.sendInvoice({
      invoice: invoiceXml,
      offlineMode: getBooleanOption(options, "offline"),
      ...(hashOfCorrectedInvoice ? { hashOfCorrectedInvoice } : {}),
    });
    await session.close();
    closed = true;

    let upoXml: string | null = null;
    let upo: JsonValue | null = null;
    if (waitForUpo) {
      upoXml = await session.waitForUpo({
        ...(pollIntervalMs !== undefined ? { pollIntervalMs } : {}),
        ...(maxAttempts !== undefined ? { maxAttempts } : {}),
      });
      if (upoXml) {
        upo = toJsonValue(parseUpoXml(upoXml));
        const upoOutput = getStringOption(options, "upo-output");
        if (upoOutput) {
          await writeOutputFile(upoOutput, upoXml, context.cwd);
        }
      }
    }

    return {
      ok: true,
      profile: loaded.profileName,
      sessionReferenceNumber: session.referenceNumber,
      invoiceReferenceNumber: sendResponse.referenceNumber,
      waitForUpo,
      ...(upoXml ? { upoXml } : {}),
      ...(upo ? { upo } : {}),
    };
  } finally {
    if (!closed) {
      await session.close().catch(() => undefined);
    }
  }
}

async function runUpo(
  positionals: string[],
  options: Record<string, string | boolean>,
  context: CommandContext,
): Promise<CliJson | string> {
  const loaded = await loadProfileContext(options, context);
  const client = await createAuthenticatedClient(loaded.profileName, loaded.profile, context);
  const command = positionals[0];
  if (command && command !== "get") {
    throw new CliError(`Unknown upo subcommand "${command}". Use "upo get".`);
  }

  const sessionReference = positionals[1] ?? getStringOption(options, "session-ref");
  if (!sessionReference) {
    throw new CliError("upo get requires --session-ref (or positional session reference).");
  }

  const invoiceReference = getStringOption(options, "invoice-ref");
  const ksefNumber = getStringOption(options, "ksef-number");
  const upoReference = getStringOption(options, "upo-ref");

  const provided = [invoiceReference, ksefNumber, upoReference].filter(Boolean);
  if (provided.length !== 1) {
    throw new CliError(
      "upo get requires exactly one selector: --invoice-ref or --ksef-number or --upo-ref.",
    );
  }

  let xml: string;
  if (invoiceReference) {
    xml = await client.sessions.getSessionInvoiceUpoByReferenceNumber(
      sessionReference,
      invoiceReference,
    );
  } else if (ksefNumber) {
    xml = await client.sessions.getSessionInvoiceUpoByKsefNumber(sessionReference, ksefNumber);
  } else {
    xml = await client.sessions.getSessionUpo(sessionReference, upoReference as string);
  }

  const outputFile = getStringOption(options, "output");
  if (outputFile) {
    await writeOutputFile(outputFile, xml, context.cwd);
  }

  if (getBooleanOption(options, "parse")) {
    return {
      ok: true,
      sessionReference,
      ...(outputFile ? { output: path.resolve(context.cwd, outputFile) } : {}),
      upo: toJsonValue(parseUpoXml(xml)),
      ...(context.json ? { upoXml: xml } : {}),
    };
  }

  if (outputFile) {
    return {
      ok: true,
      sessionReference,
      output: path.resolve(context.cwd, outputFile),
      bytes: Buffer.byteLength(xml, "utf8"),
    };
  }

  return context.json
    ? {
        sessionReference,
        upoXml: xml,
      }
    : xml;
}

async function runExport(
  options: Record<string, string | boolean>,
  context: CommandContext,
): Promise<CliJson> {
  const loaded = await loadProfileContext(options, context);
  const client = await createAuthenticatedClient(loaded.profileName, loaded.profile, context);
  const filtersFile = getStringOption(options, "filters-file");
  if (!filtersFile) {
    throw new CliError("export requires --filters-file.");
  }
  const filters = await readJsonFile<InvoiceQueryFilters>(filtersFile, context.cwd);
  const onlyMetadata = getBooleanOption(options, "only-metadata");

  const started = await client.workflows.exports.startExport({
    filters,
    ...(onlyMetadata ? { onlyMetadata: true } : {}),
  });
  const wait = !getBooleanOption(options, "no-wait");
  if (!wait) {
    return {
      ok: true,
      profile: loaded.profileName,
      referenceNumber: started.referenceNumber,
      state: "started",
    };
  }

  const pollIntervalMs = getNumberOption(options, "poll-interval-ms");
  const maxAttempts = getNumberOption(options, "max-attempts");
  const status = await client.workflows.exports.waitForExport(started.referenceNumber, {
    ...(pollIntervalMs !== undefined ? { pollIntervalMs } : {}),
    ...(maxAttempts !== undefined ? { maxAttempts } : {}),
  });

  const noDownload = getBooleanOption(options, "no-download");
  if (noDownload) {
    return {
      ok: true,
      profile: loaded.profileName,
      referenceNumber: started.referenceNumber,
      state: "completed",
      status: toJsonValue(status),
    };
  }

  const processed = await client.workflows.exports.downloadAndProcessPackage(
    status,
    started.encryptionData,
    {
      verifyHashes: getBooleanOption(options, "verify-hashes"),
    },
  );

  const outDir = getStringOption(options, "out-dir");
  let resolvedOutDir: string | undefined;
  if (outDir) {
    resolvedOutDir = path.resolve(context.cwd, outDir);
    await mkdir(resolvedOutDir, { recursive: true });
    const metadataPath = path.join(resolvedOutDir, "_metadata.json");
    await writeFile(metadataPath, JSON.stringify(processed.metadataSummaries, null, 2), "utf8");
    for (const [name, xml] of Object.entries(processed.invoiceXmlFiles)) {
      const safeName = path.basename(name);
      await writeFile(path.join(resolvedOutDir, safeName), xml, "utf8");
    }
  }

  return {
    ok: true,
    profile: loaded.profileName,
    referenceNumber: started.referenceNumber,
    state: "completed",
    metadataCount: processed.metadataSummaries.length,
    invoiceFileCount: Object.keys(processed.invoiceXmlFiles).length,
    ...(resolvedOutDir ? { outDir: resolvedOutDir } : {}),
  };
}

async function createAuthenticatedClient(
  profileName: string,
  profile: ProfileConfig,
  context: CommandContext,
): Promise<KsefClient> {
  const client = createClient(profile);
  const tokenStore = resolveTokenStore(profile, context.cliHome);
  const tokens = await loadStoredTokens(profileName, tokenStore, context.env);
  if (!tokens?.accessToken) {
    throw new CliError(
      `No access token found for profile "${profileName}". Run "ksef-ts auth login" first.`,
      EXIT_AUTH,
    );
  }
  applyTokens(client, tokens);
  const warning = formatTokenStoreWarning(profileName, tokenStore);
  if (warning) {
    context.io.stderr(warning);
  }
  return client;
}

function applyTokens(client: KsefClient, tokens: StoredTokens): void {
  if (tokens.refreshToken && tokens.refreshTokenValidUntil) {
    client.authManager.setTokens({
      accessToken: {
        token: tokens.accessToken,
        validUntil: tokens.accessTokenValidUntil ?? new Date(Date.now() + 3600 * 1000).toISOString(),
      },
      refreshToken: {
        token: tokens.refreshToken,
        validUntil: tokens.refreshTokenValidUntil,
      },
    });
    return;
  }

  client.authManager.setAccessToken(tokens.accessToken, tokens.accessTokenValidUntil);
}

function createClient(profile: ProfileConfig): KsefClient {
  const baseOptions = profile.baseUrl
    ? { baseUrl: profile.baseUrl }
    : { environment: profile.environment ?? "TEST" };

  return new KsefClient({
    ...baseOptions,
    ...(profile.strictPresignedUrlValidation !== undefined && {
      strictPresignedUrlValidation: profile.strictPresignedUrlValidation,
    }),
    ...(profile.allowedPresignedHosts ? { allowedPresignedHosts: profile.allowedPresignedHosts } : {}),
    ...(profile.allowPrivateNetworkPresignedUrls !== undefined && {
      allowPrivateNetworkPresignedUrls: profile.allowPrivateNetworkPresignedUrls,
    }),
  });
}

async function loadProfileContext(
  options: Record<string, string | boolean>,
  context: CommandContext,
): Promise<{ config: CliConfigFile; profileName: string; profile: ProfileConfig }> {
  const config = await readConfig(context.cliHome);
  if (Object.keys(config.profiles).length === 0) {
    const bootstrap = createDefaultConfig();
    await writeConfig(context.cliHome, bootstrap);
    config.currentProfile = bootstrap.currentProfile;
    config.profiles = bootstrap.profiles;
  }
  const selectedName = getStringOption(options, "profile") ?? config.currentProfile;
  const selected = config.profiles[selectedName];
  if (!selected) {
    throw new CliError(`Profile "${selectedName}" not found.`, EXIT_CONFIG);
  }
  return {
    config,
    profileName: selectedName,
    profile: selected,
  };
}

function resolveContextIdentifier(
  profile: ProfileConfig,
  options: Record<string, string | boolean>,
): ContextIdentifier {
  const contextType = getStringOption(options, "context-type");
  const contextValue = getStringOption(options, "context-value");
  if (contextType && contextValue) {
    return {
      type: contextType as ContextIdentifier["type"],
      value: contextValue,
    };
  }
  if (profile.context?.type && profile.context.value) {
    return profile.context;
  }
  throw new CliError(
    "Missing context identifier. Set profile context or pass --context-type and --context-value.",
    EXIT_CONFIG,
  );
}

function resolveLighthouseEnvironment(
  profile: ProfileConfig,
  options: Record<string, string | boolean>,
): KsefLighthouseEnvironment {
  const explicitLighthouseEnvironmentValue = getStringOption(options, "lighthouse-env");
  if (explicitLighthouseEnvironmentValue !== undefined) {
    const explicitLighthouseEnvironment = parseLighthouseEnvironment(
      explicitLighthouseEnvironmentValue,
    );
    if (explicitLighthouseEnvironment) {
      return explicitLighthouseEnvironment;
    }
    throw new CliError(
      `Unsupported --lighthouse-env "${explicitLighthouseEnvironmentValue}". Use TEST, PROD or PRD.`,
      EXIT_USAGE,
    );
  }

  const envValue = getStringOption(options, "env");
  if (envValue !== undefined) {
    const inferredFromEnv = parseLighthouseEnvironment(envValue);
    if (inferredFromEnv) {
      return inferredFromEnv;
    }
    throw new CliError(`Unsupported --env "${envValue}". Use TEST, DEMO or PRD.`, EXIT_USAGE);
  }

  if (profile.lighthouseEnvironment) {
    return profile.lighthouseEnvironment;
  }
  if (profile.environment === "PRD") {
    return "PRD";
  }
  return "TEST";
}

function parseLighthouseEnvironment(value?: string): KsefLighthouseEnvironment | undefined {
  const normalized = value?.trim().toUpperCase();
  if (!normalized) {
    return undefined;
  }

  if (normalized === "DEMO") {
    return "TEST";
  }

  if (normalized === "TEST" || normalized === "PROD" || normalized === "PRD") {
    return normalized;
  }

  return undefined;
}

function parseSortOrder(value?: string): "Asc" | "Desc" | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.toLowerCase();
  if (normalized === "asc") {
    return "Asc";
  }
  if (normalized === "desc") {
    return "Desc";
  }
  throw new CliError(`Unsupported sort order "${value}". Use Asc or Desc.`);
}

function applyProfilePatch(
  profile: ProfileConfig,
  options: Record<string, string | boolean>,
): ProfileConfig {
  const updated: ProfileConfig = {
    ...profile,
    ...(profile.tokenStore ? { tokenStore: { ...profile.tokenStore } } : {}),
  };

  const env = getStringOption(options, "env")?.toUpperCase();
  if (env) {
    if (env !== "TEST" && env !== "DEMO" && env !== "PRD") {
      throw new CliError(`Unsupported --env "${env}". Use TEST, DEMO or PRD.`);
    }
    updated.environment = env as KsefEnvironment;
  }

  const lighthouseEnv = getStringOption(options, "lighthouse-env")?.toUpperCase();
  if (lighthouseEnv) {
    if (lighthouseEnv !== "TEST" && lighthouseEnv !== "PROD" && lighthouseEnv !== "PRD") {
      throw new CliError(`Unsupported --lighthouse-env "${lighthouseEnv}". Use TEST, PROD or PRD.`);
    }
    updated.lighthouseEnvironment = lighthouseEnv as KsefLighthouseEnvironment;
  }

  const baseUrl = getStringOption(options, "base-url");
  if (baseUrl) {
    updated.baseUrl = baseUrl;
  }

  const contextType = getStringOption(options, "context-type");
  const contextValue = getStringOption(options, "context-value");
  if (contextType || contextValue) {
    if (!contextType || !contextValue) {
      throw new CliError("Both --context-type and --context-value are required together.");
    }
    updated.context = {
      type: contextType as ContextIdentifier["type"],
      value: contextValue,
    };
  }

  const tokenPolicy =
    getStringOption(options, "token-store-policy") ?? getStringOption(options, "token-store");
  if (tokenPolicy) {
    if (tokenPolicy !== "plaintext" && tokenPolicy !== "env") {
      throw new CliError(`Unsupported token store policy "${tokenPolicy}".`);
    }
    updated.tokenStore = {
      ...(updated.tokenStore ?? { policy: "plaintext" }),
      policy: tokenPolicy,
    };
  }

  const tokenFile = getStringOption(options, "token-file");
  if (tokenFile) {
    updated.tokenStore = {
      ...(updated.tokenStore ?? { policy: "plaintext" }),
      filePath: tokenFile,
    };
  }

  const accessTokenEnvVar = getStringOption(options, "access-token-env");
  if (accessTokenEnvVar) {
    updated.tokenStore = {
      ...(updated.tokenStore ?? { policy: "plaintext" }),
      accessTokenEnvVar,
    };
  }

  const refreshTokenEnvVar = getStringOption(options, "refresh-token-env");
  if (refreshTokenEnvVar) {
    updated.tokenStore = {
      ...(updated.tokenStore ?? { policy: "plaintext" }),
      refreshTokenEnvVar,
    };
  }

  const ksefTokenEnvVar = getStringOption(options, "ksef-token-env");
  if (ksefTokenEnvVar) {
    updated.tokenStore = {
      ...(updated.tokenStore ?? { policy: "plaintext" }),
      ksefTokenEnvVar,
    };
  }

  return updated;
}

async function readJsonFile<T>(filePath: string, cwd: string): Promise<T> {
  const absolute = path.resolve(cwd, filePath);
  const raw = await readFile(absolute, "utf8");
  return JSON.parse(raw) as T;
}

async function writeOutputFile(filePath: string, content: string, cwd: string): Promise<void> {
  const absolute = path.resolve(cwd, filePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, content, "utf8");
}

function normalizeError(error: unknown): { message: string; exitCode: number; name: string } {
  if (error instanceof CliError) {
    return {
      message: error.message,
      exitCode: error.exitCode,
      name: error.name,
    };
  }

  if (error instanceof KsefValidationError) {
    return {
      message: error.message,
      exitCode: EXIT_USAGE,
      name: error.name,
    };
  }

  if (error instanceof KsefSessionExpiredError) {
    return {
      message: error.message,
      exitCode: EXIT_AUTH,
      name: error.name,
    };
  }

  if (error instanceof KsefApiError || error instanceof KsefError) {
    return {
      message: error.message,
      exitCode: EXIT_REMOTE,
      name: error.name,
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  return {
    message,
    exitCode: EXIT_UNEXPECTED,
    name: "Error",
  };
}

function emit(context: CommandContext, payload: CliJson | string): void {
  if (context.json) {
    context.io.stdout(JSON.stringify(payload, null, 2));
    return;
  }

  if (typeof payload === "string") {
    context.io.stdout(payload);
    return;
  }

  context.io.stdout(JSON.stringify(payload, null, 2));
}

function emitError(
  context: CommandContext,
  error: { message: string; exitCode: number; name: string },
): void {
  if (context.json) {
    context.io.stderr(
      JSON.stringify(
        {
          ok: false,
          error: {
            name: error.name,
            message: error.message,
            exitCode: error.exitCode,
          },
        },
        null,
        2,
      ),
    );
    return;
  }
  context.io.stderr(`Error: ${error.message}`);
}

function helpText(): string {
  return [
    "ksef-ts - KSeF TypeScript CLI",
    "",
    "Usage:",
    "  ksef-ts [--json] <command> [options]",
    "",
    "Commands:",
    "  init        Initialize CLI config/profile",
    "  profile     Manage profiles (list, show, set, use)",
    "  auth        Authenticate (login, refresh, status, logout)",
    "  health      Basic API health checks using SDK",
    "  lighthouse  Query KSeF lighthouse status endpoint",
    "  invoice     Invoice operations (get, query)",
    "  send        Open session and send invoice XML",
    "  upo         Download UPO by session + invoice selector",
    "  export      Start/wait/download invoice export",
    "",
    "Examples:",
    "  ksef-ts init --profile prod --env PRD --context-type Nip --context-value 1111111111",
    "  ksef-ts auth login --token <ksef-token>",
    "  ksef-ts health --with-auth",
    "  ksef-ts invoice get <ksef-number> --output invoice.xml",
    "  ksef-ts send --invoice-file ./invoice.xml --wait-upo --upo-output upo.xml",
    "  ksef-ts export --filters-file ./filters.json --only-metadata --out-dir ./exports",
  ].join("\n");
}

function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function isDirectExecution(): boolean {
  const scriptPath = process.argv[1];
  if (!scriptPath) {
    return false;
  }
  return import.meta.url === pathToFileURL(scriptPath).href;
}

if (isDirectExecution()) {
  void runCli(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
