import assert from "node:assert/strict";
import { test } from "node:test";
import { AuthCoordinator, CryptographyService, KsefError } from "../../dist/index.js";

test("authenticateWithXadesSignature polls until success and redeems token", async () => {
  const calls = [];
  const authClient = {
    authenticateWithXadesSignature: async () => ({
      referenceNumber: "AUTH-REF-1",
      authenticationToken: { token: "AUTH-TOKEN", validUntil: "2999-01-01T00:00:00Z" },
    }),
    getAuthStatus: async () => {
      calls.push("status");
      if (calls.length === 1) {
        return { status: { code: 100, description: "Processing" } };
      }
      return { status: { code: 200, description: "Ok" } };
    },
    redeemToken: async (token) => ({
      accessToken: { token: `access:${token}`, validUntil: "2999-01-01T00:00:00Z" },
      refreshToken: { token: "refresh", validUntil: "2999-01-01T00:00:00Z" },
    }),
  };
  const securityClient = { getPublicKeyCertificates: async () => [] };
  const coordinator = new AuthCoordinator(authClient, securityClient);

  const result = await coordinator.authenticateWithXadesSignature({
    signedXml: "<SignedXml/>",
    pollIntervalMs: 0,
    maxAttempts: 3,
  });

  assert.equal(calls.length, 2);
  assert.equal(result.accessToken.token, "access:AUTH-TOKEN");
});

test("authenticateWithXadesSignature throws detailed error when status is terminal failure", async () => {
  const authClient = {
    authenticateWithXadesSignature: async () => ({
      referenceNumber: "AUTH-REF-2",
      authenticationToken: { token: "AUTH-TOKEN", validUntil: "2999-01-01T00:00:00Z" },
    }),
    getAuthStatus: async () => ({
      status: { code: 460, description: "Rejected", details: ["Reason A", "Reason B"] },
    }),
    redeemToken: async () => {
      throw new Error("redeemToken should not be called");
    },
  };
  const securityClient = { getPublicKeyCertificates: async () => [] };
  const coordinator = new AuthCoordinator(authClient, securityClient);

  await assert.rejects(
    () =>
      coordinator.authenticateWithXadesSignature({
        signedXml: "<SignedXml/>",
        pollIntervalMs: 0,
        maxAttempts: 1,
      }),
    /Authentication failed: 460 Rejected Details: Reason A, Reason B/,
  );
});

test("authenticateWithXadesSignature throws when polling exceeds max attempts", async () => {
  const authClient = {
    authenticateWithXadesSignature: async () => ({
      referenceNumber: "AUTH-REF-3",
      authenticationToken: { token: "AUTH-TOKEN", validUntil: "2999-01-01T00:00:00Z" },
    }),
    getAuthStatus: async () => ({
      status: { code: 100, description: "Processing" },
    }),
    redeemToken: async () => {
      throw new Error("redeemToken should not be called");
    },
  };
  const securityClient = { getPublicKeyCertificates: async () => [] };
  const coordinator = new AuthCoordinator(authClient, securityClient);

  await assert.rejects(
    () =>
      coordinator.authenticateWithXadesSignature({
        signedXml: "<SignedXml/>",
        pollIntervalMs: 0,
        maxAttempts: 2,
      }),
    /Authentication did not complete within max attempts\./,
  );
});

test("authenticateWithKsefToken builds encrypted request and redeems on success", async () => {
  const originalEncryptKsefToken = CryptographyService.encryptKsefToken;
  const encryptCalls = [];
  const authClient = {
    getChallenge: async () => ({
      challenge: "challenge-value",
      timestampMs: 1700000000000,
      timestamp: "2023-11-14T22:13:20.000Z",
    }),
    authenticateWithKsefToken: async (request) => {
      assert.equal(request.challenge, "challenge-value");
      assert.equal(request.encryptedToken, "encrypted-token");
      return {
        referenceNumber: "AUTH-REF-4",
        authenticationToken: { token: "AUTH-TOKEN", validUntil: "2999-01-01T00:00:00Z" },
      };
    },
    getAuthStatus: async () => ({
      status: { code: 200, description: "Ok" },
    }),
    redeemToken: async () => ({
      accessToken: { token: "access", validUntil: "2999-01-01T00:00:00Z" },
      refreshToken: { token: "refresh", validUntil: "2999-01-01T00:00:00Z" },
    }),
  };
  const securityClient = { getPublicKeyCertificates: async () => [] };
  const coordinator = new AuthCoordinator(authClient, securityClient);

  CryptographyService.encryptKsefToken = (...args) => {
    encryptCalls.push(args);
    return "encrypted-token";
  };

  try {
    const result = await coordinator.authenticateWithKsefToken({
      token: "plain-token",
      context: { type: "Nip", value: "1234567890" },
      publicCertificateBase64Der: "CERTIFICATE_VALUE",
      pollIntervalMs: 0,
      maxAttempts: 1,
      authorizationPolicy: { allowedIps: { ip4Addresses: ["10.0.0.1"] } },
    });

    assert.equal(result.accessToken.token, "access");
    assert.deepEqual(encryptCalls[0], [
      "plain-token",
      1700000000000,
      "CERTIFICATE_VALUE",
      "rsa",
      "java",
    ]);
  } finally {
    CryptographyService.encryptKsefToken = originalEncryptKsefToken;
  }
});

test("authenticateWithKsefToken fails when required certificate usage is missing", async () => {
  const authClient = {
    getChallenge: async () => ({
      challenge: "challenge-value",
      timestampMs: 1700000000000,
    }),
  };
  const securityClient = {
    getPublicKeyCertificates: async () => [{ usage: ["OtherUsage"], certificate: "CERT" }],
  };
  const coordinator = new AuthCoordinator(authClient, securityClient);

  await assert.rejects(
    () =>
      coordinator.authenticateWithKsefToken({
        token: "plain-token",
        context: { type: "Nip", value: "1234567890" },
        pollIntervalMs: 0,
        maxAttempts: 1,
      }),
    (error) => {
      assert.ok(error instanceof KsefError);
      assert.equal(
        error.message,
        "No public certificate found for usage KsefTokenEncryption.",
      );
      return true;
    },
  );
});

test("authenticateWithKsefToken derives timestamp from challenge.timestamp when timestampMs is missing", async () => {
  const originalEncryptKsefToken = CryptographyService.encryptKsefToken;
  const encryptCalls = [];
  const authClient = {
    getChallenge: async () => ({
      challenge: "challenge-value",
      timestamp: "2026-03-03T10:00:00.000Z",
    }),
    authenticateWithKsefToken: async () => ({
      referenceNumber: "AUTH-REF-TS",
      authenticationToken: { token: "AUTH-TOKEN", validUntil: "2999-01-01T00:00:00Z" },
    }),
    getAuthStatus: async () => ({
      status: { code: 200, description: "Ok" },
    }),
    redeemToken: async () => ({
      accessToken: { token: "access", validUntil: "2999-01-01T00:00:00Z" },
      refreshToken: { token: "refresh", validUntil: "2999-01-01T00:00:00Z" },
    }),
  };
  const securityClient = {
    getPublicKeyCertificates: async () => [{ usage: ["KsefTokenEncryption"], certificate: "CERT" }],
  };
  const coordinator = new AuthCoordinator(authClient, securityClient);

  CryptographyService.encryptKsefToken = (...args) => {
    encryptCalls.push(args);
    return "encrypted-token";
  };

  try {
    await coordinator.authenticateWithKsefToken({
      token: "plain-token",
      context: { type: "Nip", value: "1234567890" },
      pollIntervalMs: 0,
      maxAttempts: 1,
    });
    assert.equal(encryptCalls.length, 1);
    assert.equal(encryptCalls[0][1], Date.parse("2026-03-03T10:00:00.000Z"));
  } finally {
    CryptographyService.encryptKsefToken = originalEncryptKsefToken;
  }
});

test("authenticateWithKsefToken falls back to Date.now when challenge timestamp is invalid", async () => {
  const originalEncryptKsefToken = CryptographyService.encryptKsefToken;
  const originalDateNow = Date.now;
  const encryptCalls = [];
  Date.now = () => 1705000000000;
  const authClient = {
    getChallenge: async () => ({
      challenge: "challenge-value",
      timestamp: "invalid-date",
    }),
    authenticateWithKsefToken: async () => ({
      referenceNumber: "AUTH-REF-NOW",
      authenticationToken: { token: "AUTH-TOKEN", validUntil: "2999-01-01T00:00:00Z" },
    }),
    getAuthStatus: async () => ({
      status: { code: 200, description: "Ok" },
    }),
    redeemToken: async () => ({
      accessToken: { token: "access", validUntil: "2999-01-01T00:00:00Z" },
      refreshToken: { token: "refresh", validUntil: "2999-01-01T00:00:00Z" },
    }),
  };
  const securityClient = {
    getPublicKeyCertificates: async () => [{ usage: ["KsefTokenEncryption"], certificate: "CERT" }],
  };
  const coordinator = new AuthCoordinator(authClient, securityClient);

  CryptographyService.encryptKsefToken = (...args) => {
    encryptCalls.push(args);
    return "encrypted-token";
  };

  try {
    await coordinator.authenticateWithKsefToken({
      token: "plain-token",
      context: { type: "Nip", value: "1234567890" },
      pollIntervalMs: 0,
      maxAttempts: 1,
    });
    assert.equal(encryptCalls.length, 1);
    assert.equal(encryptCalls[0][1], 1705000000000);
  } finally {
    Date.now = originalDateNow;
    CryptographyService.encryptKsefToken = originalEncryptKsefToken;
  }
});

test("authenticateWithXadesSignature uses default polling options and handles missing status payload", async () => {
  const authClient = {
    authenticateWithXadesSignature: async () => ({
      referenceNumber: "AUTH-REF-DEFAULTS",
      authenticationToken: { token: "AUTH-TOKEN", validUntil: "2999-01-01T00:00:00Z" },
    }),
    getAuthStatus: async () => ({}),
    redeemToken: async () => {
      throw new Error("redeemToken should not be called");
    },
  };
  const coordinator = new AuthCoordinator(authClient, { getPublicKeyCertificates: async () => [] });

  await assert.rejects(
    () => coordinator.authenticateWithXadesSignature({ signedXml: "<SignedXml/>" }),
    /Authentication failed: undefined undefined/,
  );
});

test("authenticateWithXadesSignature failure omits details when no detail list is provided", async () => {
  const authClient = {
    authenticateWithXadesSignature: async () => ({
      referenceNumber: "AUTH-REF-NO-DETAILS",
      authenticationToken: { token: "AUTH-TOKEN", validUntil: "2999-01-01T00:00:00Z" },
    }),
    getAuthStatus: async () => ({
      status: { code: 460, description: "Rejected" },
    }),
    redeemToken: async () => {
      throw new Error("redeemToken should not be called");
    },
  };
  const coordinator = new AuthCoordinator(authClient, { getPublicKeyCertificates: async () => [] });

  await assert.rejects(
    () => coordinator.authenticateWithXadesSignature({ signedXml: "<SignedXml/>", pollIntervalMs: 0, maxAttempts: 1 }),
    /Authentication failed: 460 Rejected$/,
  );
});
