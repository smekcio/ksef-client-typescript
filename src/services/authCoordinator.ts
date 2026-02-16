import { AuthClient } from "../api/authClient";
import { SecurityClient } from "../api/securityClient";
import { CryptographyService } from "../crypto/cryptographyService";
import { KsefError } from "../errors/errors";
import { buildAuthTokenRequestXml } from "./authXml";
import { XadesKeyPair, XadesSignatureService } from "./xades";
import { AuthTokenRedeemResponse, InitTokenAuthenticationRequest } from "../types/auth";
import {
  AuthenticationInitResponse,
  AuthorizationPolicy,
  ContextIdentifier,
  StatusInfo,
} from "../types/common";

export interface AuthenticateWithKsefTokenOptions {
  token: string;
  context: ContextIdentifier;
  authorizationPolicy?: AuthorizationPolicy;
  publicCertificateBase64Der?: string;
  encryptionMethod?: "rsa" | "ec";
  ecOutputFormat?: "java" | "csharp";
  pollIntervalMs?: number;
  maxAttempts?: number;
}

export interface AuthenticateWithXadesOptions {
  signedXml: string;
  verifyCertificateChain?: boolean;
  enforceXadesCompliance?: boolean;
  pollIntervalMs?: number;
  maxAttempts?: number;
}

export interface AuthenticateWithCertificateOptions {
  keyPair: XadesKeyPair;
  context: ContextIdentifier;
  subjectIdentifierType?: "certificateSubject" | "certificateFingerprint";
  authorizationPolicyXml?: string | null;
  signaturePackaging?: "enveloped" | "enveloping";
  verifyCertificateChain?: boolean;
  enforceXadesCompliance?: boolean;
  pollIntervalMs?: number;
  maxAttempts?: number;
}

export class AuthCoordinator {
  private readonly authClient: AuthClient;
  private readonly securityClient: SecurityClient;
  private readonly xadesSignatureService: XadesSignatureService;

  constructor(authClient: AuthClient, securityClient: SecurityClient) {
    this.authClient = authClient;
    this.securityClient = securityClient;
    this.xadesSignatureService = new XadesSignatureService();
  }

  async authenticateWithKsefToken(
    options: AuthenticateWithKsefTokenOptions,
  ): Promise<AuthTokenRedeemResponse> {
    const challenge = await this.authClient.getChallenge();
    const parsedTimestamp = challenge.timestamp ? Date.parse(challenge.timestamp) : NaN;
    const timestampMs =
      challenge.timestampMs ?? (Number.isNaN(parsedTimestamp) ? Date.now() : parsedTimestamp);

    const publicCertificate =
      options.publicCertificateBase64Der ??
      (await this.getCertificateByUsage("KsefTokenEncryption"));

    const encryptedToken = CryptographyService.encryptKsefToken(
      options.token,
      timestampMs,
      publicCertificate,
      options.encryptionMethod ?? "rsa",
      options.ecOutputFormat ?? "java",
    );

    const request: InitTokenAuthenticationRequest = {
      challenge: challenge.challenge,
      contextIdentifier: options.context,
      encryptedToken,
      ...(options.authorizationPolicy !== undefined && {
        authorizationPolicy: options.authorizationPolicy,
      }),
    };

    const init = await this.authClient.authenticateWithKsefToken(request);
    await this.pollAuthStatus(init, options.pollIntervalMs ?? 2000, options.maxAttempts ?? 30);

    return await this.authClient.redeemToken(init.authenticationToken.token);
  }

  async authenticateWithXadesSignature(
    options: AuthenticateWithXadesOptions,
  ): Promise<AuthTokenRedeemResponse> {
    const init = await this.authClient.authenticateWithXadesSignature(
      options.signedXml,
      options.verifyCertificateChain,
      options.enforceXadesCompliance,
    );
    await this.pollAuthStatus(init, options.pollIntervalMs ?? 2000, options.maxAttempts ?? 30);
    return await this.authClient.redeemToken(init.authenticationToken.token);
  }

  async authenticateWithCertificate(
    options: AuthenticateWithCertificateOptions,
  ): Promise<AuthTokenRedeemResponse> {
    const challenge = await this.authClient.getChallenge();

    const xml = buildAuthTokenRequestXml({
      challenge: challenge.challenge,
      contextIdentifierType: options.context.type,
      contextIdentifierValue: options.context.value,
      ...(options.subjectIdentifierType !== undefined && {
        subjectIdentifierType: options.subjectIdentifierType,
      }),
      ...(options.authorizationPolicyXml !== undefined && {
        authorizationPolicyXml: options.authorizationPolicyXml,
      }),
    });

    const signedXml =
      options.signaturePackaging === "enveloping"
        ? this.xadesSignatureService.signXadesEnveloping({ xml, keyPair: options.keyPair })
        : this.xadesSignatureService.signXadesEnveloped({ xml, keyPair: options.keyPair });

    return await this.authenticateWithXadesSignature({
      signedXml,
      ...(options.verifyCertificateChain !== undefined && {
        verifyCertificateChain: options.verifyCertificateChain,
      }),
      ...(options.enforceXadesCompliance !== undefined && {
        enforceXadesCompliance: options.enforceXadesCompliance,
      }),
      ...(options.pollIntervalMs !== undefined && {
        pollIntervalMs: options.pollIntervalMs,
      }),
      ...(options.maxAttempts !== undefined && { maxAttempts: options.maxAttempts }),
    });
  }

  private async pollAuthStatus(
    init: AuthenticationInitResponse,
    pollIntervalMs: number,
    maxAttempts: number,
  ): Promise<void> {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const statusResponse = await this.authClient.getAuthStatus(
        init.referenceNumber,
        init.authenticationToken.token,
      );
      const status = statusResponse.status ?? ({} as StatusInfo);
      if (status.code === 200) {
        return;
      }
      if (status.code !== 100) {
        const details = status.details?.length ? ` Details: ${status.details.join(", ")}` : "";
        throw new KsefError(
          `Authentication failed: ${status.code} ${status.description}${details}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
    throw new KsefError("Authentication did not complete within max attempts.");
  }

  private async getCertificateByUsage(
    usage: "KsefTokenEncryption" | "SymmetricKeyEncryption",
  ): Promise<string> {
    const certificates = await this.securityClient.getPublicKeyCertificates();
    const cert = certificates.find((item) => item.usage.includes(usage));
    if (!cert) {
      throw new KsefError(`No public certificate found for usage ${usage}.`);
    }
    return cert.certificate;
  }
}
