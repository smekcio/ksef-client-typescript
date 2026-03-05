import assert from "node:assert/strict";
import { test } from "node:test";
import { AuthCoordinator, XadesSignatureService } from "../../dist/index.js";

test("authenticateWithCertificate signs enveloped XML by default and redeems token", async () => {
  const originalEnveloped = XadesSignatureService.prototype.signXadesEnveloped;
  const originalEnveloping = XadesSignatureService.prototype.signXadesEnveloping;
  const signedCalls = [];

  XadesSignatureService.prototype.signXadesEnveloped = ({ xml, keyPair }) => {
    signedCalls.push({ mode: "enveloped", xml, keyPair });
    return "<SignedEnveloped/>";
  };
  XadesSignatureService.prototype.signXadesEnveloping = ({ xml, keyPair }) => {
    signedCalls.push({ mode: "enveloping", xml, keyPair });
    return "<SignedEnveloping/>";
  };

  const authCalls = [];
  const authClient = {
    getChallenge: async () => ({ challenge: "CHALLENGE-1" }),
    authenticateWithXadesSignature: async (signedXml, verifyCertificateChain, enforceXadesCompliance) => {
      authCalls.push({ signedXml, verifyCertificateChain, enforceXadesCompliance });
      return {
        referenceNumber: "AUTH-REF-1",
        authenticationToken: { token: "AUTH-TOKEN-1", validUntil: "2099-01-01T00:00:00Z" },
      };
    },
    getAuthStatus: async () => ({ status: { code: 200, description: "Ok" } }),
    redeemToken: async () => ({
      accessToken: { token: "ACCESS-1", validUntil: "2099-01-01T00:00:00Z" },
      refreshToken: { token: "REFRESH-1", validUntil: "2099-01-01T00:00:00Z" },
    }),
  };

  const coordinator = new AuthCoordinator(authClient, { getPublicKeyCertificates: async () => [] });
  try {
    const keyPair = { privateKeyPem: "PRIVATE", certificatePem: "CERT" };
    const result = await coordinator.authenticateWithCertificate({
      keyPair,
      context: { type: "Nip", value: "1111111111" },
      pollIntervalMs: 0,
      maxAttempts: 1,
    });

    assert.equal(result.accessToken.token, "ACCESS-1");
    assert.equal(signedCalls.length, 1);
    assert.equal(signedCalls[0].mode, "enveloped");
    assert.equal(authCalls.length, 1);
    assert.equal(authCalls[0].signedXml, "<SignedEnveloped/>");
    assert.equal(authCalls[0].verifyCertificateChain, undefined);
    assert.equal(authCalls[0].enforceXadesCompliance, undefined);
  } finally {
    XadesSignatureService.prototype.signXadesEnveloped = originalEnveloped;
    XadesSignatureService.prototype.signXadesEnveloping = originalEnveloping;
  }
});

test("authenticateWithCertificate signs enveloping XML and forwards optional auth flags", async () => {
  const originalEnveloped = XadesSignatureService.prototype.signXadesEnveloped;
  const originalEnveloping = XadesSignatureService.prototype.signXadesEnveloping;
  const signedCalls = [];

  XadesSignatureService.prototype.signXadesEnveloped = ({ xml, keyPair }) => {
    signedCalls.push({ mode: "enveloped", xml, keyPair });
    return "<SignedEnveloped/>";
  };
  XadesSignatureService.prototype.signXadesEnveloping = ({ xml, keyPair }) => {
    signedCalls.push({ mode: "enveloping", xml, keyPair });
    return "<SignedEnveloping/>";
  };

  const authCalls = [];
  const authClient = {
    getChallenge: async () => ({ challenge: "CHALLENGE-2" }),
    authenticateWithXadesSignature: async (signedXml, verifyCertificateChain, enforceXadesCompliance) => {
      authCalls.push({ signedXml, verifyCertificateChain, enforceXadesCompliance });
      return {
        referenceNumber: "AUTH-REF-2",
        authenticationToken: { token: "AUTH-TOKEN-2", validUntil: "2099-01-01T00:00:00Z" },
      };
    },
    getAuthStatus: async () => ({ status: { code: 200, description: "Ok" } }),
    redeemToken: async () => ({
      accessToken: { token: "ACCESS-2", validUntil: "2099-01-01T00:00:00Z" },
      refreshToken: { token: "REFRESH-2", validUntil: "2099-01-01T00:00:00Z" },
    }),
  };

  const coordinator = new AuthCoordinator(authClient, { getPublicKeyCertificates: async () => [] });
  try {
    const keyPair = { privateKeyPem: "PRIVATE", certificatePem: "CERT" };
    const result = await coordinator.authenticateWithCertificate({
      keyPair,
      context: { type: "Nip", value: "2222222222" },
      signaturePackaging: "enveloping",
      subjectIdentifierType: "certificateFingerprint",
      authorizationPolicyXml: "<AuthorizationPolicy/>",
      verifyCertificateChain: true,
      enforceXadesCompliance: true,
      pollIntervalMs: 0,
      maxAttempts: 1,
    });

    assert.equal(result.accessToken.token, "ACCESS-2");
    assert.equal(signedCalls.length, 1);
    assert.equal(signedCalls[0].mode, "enveloping");
    assert.equal(authCalls.length, 1);
    assert.equal(authCalls[0].signedXml, "<SignedEnveloping/>");
    assert.equal(authCalls[0].verifyCertificateChain, true);
    assert.equal(authCalls[0].enforceXadesCompliance, true);
  } finally {
    XadesSignatureService.prototype.signXadesEnveloped = originalEnveloped;
    XadesSignatureService.prototype.signXadesEnveloping = originalEnveloping;
  }
});
