import assert from "node:assert/strict";
import { test } from "node:test";
import { CertificatesClient } from "../../dist/index.js";

test("queryCertificates sends pagination query params", async () => {
  let capturedOptions;
  const http = {
    request: async (options) => {
      capturedOptions = options;
      return {};
    },
  };
  const client = new CertificatesClient(http, async () => "access-token");
  const request = { queryCriteria: { status: ["ACTIVE"] } };

  await client.queryCertificates(request, 10, 25);

  assert.equal(capturedOptions.method, "POST");
  assert.equal(capturedOptions.path, "/certificates/query");
  assert.deepEqual(capturedOptions.query, {
    pageOffset: 10,
    pageSize: 25,
  });
  assert.deepEqual(capturedOptions.body, request);
});

test("queryCertificates omits pagination query when page params are not provided", async () => {
  let capturedOptions;
  const http = {
    request: async (options) => {
      capturedOptions = options;
      return {};
    },
  };
  const client = new CertificatesClient(http, async () => "access-token");
  const request = { queryCriteria: { status: ["ACTIVE"] } };

  await client.queryCertificates(request);

  assert.equal(capturedOptions.method, "POST");
  assert.equal(capturedOptions.path, "/certificates/query");
  assert.equal("query" in capturedOptions, false);
  assert.deepEqual(capturedOptions.body, request);
});

test("revokeCertificate sends empty object as body when request is not provided", async () => {
  let capturedOptions;
  const http = {
    request: async (options) => {
      capturedOptions = options;
      return {};
    },
  };
  const client = new CertificatesClient(http, async () => "access-token");

  await client.revokeCertificate("SERIAL/123");

  assert.equal(capturedOptions.method, "POST");
  assert.equal(capturedOptions.path, "/certificates/SERIAL%2F123/revoke");
  assert.deepEqual(capturedOptions.body, {});
});

test("certificate client endpoints use expected paths, methods and body", async () => {
  const calls = [];
  const http = {
    request: async (options) => {
      calls.push(options);
      return {};
    },
  };
  const client = new CertificatesClient(http, async () => "access-token");

  const enrollmentRequest = {
    csr: "base64-csr",
    validFrom: "2025-01-01T00:00:00Z",
  };
  const retrieveRequest = {
    queryCriteria: { certificateSerialNumbers: ["SER-1"] },
  };

  await client.getCertificateLimits();
  await client.getEnrollmentData();
  await client.createEnrollment(enrollmentRequest);
  await client.getEnrollmentStatus("REF/123");
  await client.retrieveCertificates(retrieveRequest);

  assert.deepEqual(
    calls.map((options) => ({
      method: options.method,
      path: options.path,
      authToken: options.authToken,
      hasBody: "body" in options,
    })),
    [
      {
        method: "GET",
        path: "/certificates/limits",
        authToken: "access-token",
        hasBody: false,
      },
      {
        method: "GET",
        path: "/certificates/enrollments/data",
        authToken: "access-token",
        hasBody: false,
      },
      {
        method: "POST",
        path: "/certificates/enrollments",
        authToken: "access-token",
        hasBody: true,
      },
      {
        method: "GET",
        path: "/certificates/enrollments/REF%2F123",
        authToken: "access-token",
        hasBody: false,
      },
      {
        method: "POST",
        path: "/certificates/retrieve",
        authToken: "access-token",
        hasBody: true,
      },
    ],
  );
  assert.deepEqual(calls[2].body, enrollmentRequest);
  assert.deepEqual(calls[4].body, retrieveRequest);
});
