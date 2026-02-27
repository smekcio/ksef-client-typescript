import {
  ActiveSessionsClient,
  AuthClient,
  CertificatesClient,
  InvoicesClient,
  LighthouseClient,
  LimitsClient,
  PeppolClient,
  PermissionsClient,
  SecurityClient,
  SessionsClient,
  TestdataClient,
  TokensClient,
} from "../api";
import { AuthCoordinator } from "../services/authCoordinator";
import { BatchSessionWorkflow } from "../services/batchSessionWorkflow";
import { IncrementalExportWorkflow } from "../services/incrementalExportWorkflow";
import { InvoiceExportWorkflow } from "../services/invoiceExportWorkflow";
import { OfflineInvoiceWorkflow } from "../services/offlineInvoiceWorkflow";
import { OnlineSessionWorkflow } from "../services/onlineSessionWorkflow";
import { PersonTokenService } from "../services/personTokenService";
import { QrCodeService } from "../services/qrCodeService";
import { VerificationLinkService } from "../services/verificationLinkService";
import { HttpClient } from "./httpClient";
import { AuthManager } from "./authManager";
import {
  AuthorizationPolicy,
  ContextIdentifier,
  KsefEnvironment,
  KsefLighthouseEnvironment,
  KSEF_LIGHTHOUSE_ENV_BY_KSEF_ENV,
  KSEF_ENV_URLS,
  KSEF_LIGHTHOUSE_URLS,
  KSEF_QR_URLS,
} from "../types/common";

export interface KsefClientOptions {
  baseUrl?: string;
  environment?: KsefEnvironment;
  timeoutMs?: number;
  appendV2?: boolean;
  proxy?: string;
  noProxy?: string;
  headers?: Record<string, string>;
  baseQrUrl?: string;
  baseLighthouseUrl?: string;
  lighthouseEnvironment?: KsefLighthouseEnvironment;
  retryOn429?: boolean;
  retryOn5xx?: boolean;
  retryOnTimeout?: boolean;
  maxRetryAttempts?: number;
  maxRetryDelayMs?: number;
  strictPresignedUrlValidation?: boolean;
  allowedPresignedHosts?: string[];
  allowPrivateNetworkPresignedUrls?: boolean;
  requireExportPartHash?: boolean;
}

export interface KsefConnectOptions extends KsefClientOptions {
  token: string;
  context: ContextIdentifier;
  authorizationPolicy?: AuthorizationPolicy;
  maxAttempts?: number;
  pollIntervalMs?: number;
  publicCertificateBase64Der?: string;
}

export class KsefClient {
  readonly auth: AuthClient;
  readonly security: SecurityClient;
  readonly sessions: SessionsClient;
  readonly invoices: InvoicesClient;
  readonly permissions: PermissionsClient;
  readonly certificates: CertificatesClient;
  readonly tokens: TokensClient;
  readonly limits: LimitsClient;
  readonly testdata: TestdataClient;
  readonly peppol: PeppolClient;
  readonly lighthouse: LighthouseClient;
  readonly activeSessions: ActiveSessionsClient;
  readonly authManager: AuthManager;
  readonly baseQrUrl: string;
  readonly workflows: {
    auth: AuthCoordinator;
    sessions: {
      online: OnlineSessionWorkflow;
      batch: BatchSessionWorkflow;
    };
    offline: OfflineInvoiceWorkflow;
    exports: InvoiceExportWorkflow;
    exportsIncremental: IncrementalExportWorkflow;
  };
  readonly verificationLinks: VerificationLinkService;
  readonly qr: QrCodeService;
  readonly personToken: PersonTokenService;

  private readonly http: HttpClient;

  constructor(options: KsefClientOptions = {}) {
    const baseUrl =
      options.baseUrl ?? (options.environment ? KSEF_ENV_URLS[options.environment] : undefined);
    if (!baseUrl) {
      throw new Error("baseUrl or environment is required.");
    }
    this.baseQrUrl =
      options.baseQrUrl ??
      (options.environment ? KSEF_QR_URLS[options.environment] : KSEF_QR_URLS.TEST);
    const baseLighthouseUrl = resolveLighthouseBaseUrl(baseUrl, options);
    const httpOptions = {
      baseUrl,
      ...(options.appendV2 !== undefined && { appendV2: options.appendV2 }),
      ...(options.timeoutMs !== undefined && { timeoutMs: options.timeoutMs }),
      ...(options.headers && { defaultHeaders: options.headers }),
      ...(options.proxy && { proxy: options.proxy }),
      ...(options.noProxy && { noProxy: options.noProxy }),
      ...(options.retryOn429 !== undefined && { retryOn429: options.retryOn429 }),
      ...(options.retryOn5xx !== undefined && { retryOn5xx: options.retryOn5xx }),
      ...(options.retryOnTimeout !== undefined && { retryOnTimeout: options.retryOnTimeout }),
      ...(options.maxRetryAttempts !== undefined && {
        maxRetryAttempts: options.maxRetryAttempts,
      }),
      ...(options.maxRetryDelayMs !== undefined && {
        maxRetryDelayMs: options.maxRetryDelayMs,
      }),
      ...(options.strictPresignedUrlValidation !== undefined && {
        strictPresignedUrlValidation: options.strictPresignedUrlValidation,
      }),
      ...(options.allowedPresignedHosts && {
        allowedPresignedHosts: options.allowedPresignedHosts,
      }),
      ...(options.allowPrivateNetworkPresignedUrls !== undefined && {
        allowPrivateNetworkPresignedUrls: options.allowPrivateNetworkPresignedUrls,
      }),
    };
    this.http = new HttpClient(httpOptions);

    this.auth = new AuthClient(this.http);
    this.authManager = new AuthManager(this.auth);
    const tokenProvider = () => this.authManager.getAccessToken();

    this.security = new SecurityClient(this.http, tokenProvider);
    this.sessions = new SessionsClient(this.http, tokenProvider);
    this.invoices = new InvoicesClient(this.http, tokenProvider);
    this.permissions = new PermissionsClient(this.http, tokenProvider);
    this.certificates = new CertificatesClient(this.http, tokenProvider);
    this.tokens = new TokensClient(this.http, tokenProvider);
    this.limits = new LimitsClient(this.http, tokenProvider);
    this.testdata = new TestdataClient(this.http, tokenProvider);
    this.peppol = new PeppolClient(this.http, tokenProvider);
    this.lighthouse = new LighthouseClient(this.http, baseLighthouseUrl);
    this.activeSessions = new ActiveSessionsClient(this.http, tokenProvider);

    const onlineSessionWorkflow = new OnlineSessionWorkflow(
      this.sessions,
      this.security,
      this.http,
    );
    const batchSessionWorkflow = new BatchSessionWorkflow(this.sessions, this.security, this.http);
    const offlineInvoiceWorkflow = new OfflineInvoiceWorkflow(onlineSessionWorkflow);
    const exportsWorkflow = new InvoiceExportWorkflow(this.invoices, this.security, this.http, {
      ...(options.requireExportPartHash !== undefined && {
        requireExportPartHash: options.requireExportPartHash,
      }),
    });
    this.workflows = {
      auth: new AuthCoordinator(this.auth, this.security),
      sessions: {
        online: onlineSessionWorkflow,
        batch: batchSessionWorkflow,
      },
      offline: offlineInvoiceWorkflow,
      exports: exportsWorkflow,
      exportsIncremental: new IncrementalExportWorkflow(exportsWorkflow),
    };

    this.verificationLinks = new VerificationLinkService({
      baseQrUrl: this.baseQrUrl,
    });
    this.qr = new QrCodeService();
    this.personToken = new PersonTokenService();
  }

  static async connect(options: KsefConnectOptions): Promise<KsefClient> {
    const client = new KsefClient(options);
    const authOptions = {
      token: options.token,
      context: options.context,
      ...(options.authorizationPolicy && {
        authorizationPolicy: options.authorizationPolicy,
      }),
      ...(options.maxAttempts !== undefined && {
        maxAttempts: options.maxAttempts,
      }),
      ...(options.pollIntervalMs !== undefined && {
        pollIntervalMs: options.pollIntervalMs,
      }),
      ...(options.publicCertificateBase64Der && {
        publicCertificateBase64Der: options.publicCertificateBase64Der,
      }),
    };
    const tokens = await client.workflows.auth.authenticateWithKsefToken(authOptions);
    client.authManager.setTokens(tokens);
    return client;
  }
}

function resolveLighthouseBaseUrl(baseUrl: string, options: KsefClientOptions): string {
  if (options.baseLighthouseUrl) {
    return trimTrailingSlash(options.baseLighthouseUrl);
  }

  if (options.lighthouseEnvironment) {
    return KSEF_LIGHTHOUSE_URLS[options.lighthouseEnvironment];
  }

  if (options.environment) {
    return KSEF_LIGHTHOUSE_URLS[KSEF_LIGHTHOUSE_ENV_BY_KSEF_ENV[options.environment]];
  }

  const normalizedBaseUrl = trimTrailingSlash(baseUrl);
  for (const [environment, apiBaseUrl] of Object.entries(KSEF_ENV_URLS) as Array<
    [KsefEnvironment, string]
  >) {
    const normalizedApiBaseUrl = trimTrailingSlash(apiBaseUrl);
    const apiBaseWithoutV2 = normalizedApiBaseUrl.endsWith("/v2")
      ? normalizedApiBaseUrl.slice(0, -3)
      : normalizedApiBaseUrl;
    if (
      normalizedBaseUrl.startsWith(normalizedApiBaseUrl) ||
      normalizedBaseUrl.startsWith(apiBaseWithoutV2)
    ) {
      const lighthouseEnvironment = KSEF_LIGHTHOUSE_ENV_BY_KSEF_ENV[environment];
      return KSEF_LIGHTHOUSE_URLS[lighthouseEnvironment];
    }
  }
  return KSEF_LIGHTHOUSE_URLS.TEST;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
