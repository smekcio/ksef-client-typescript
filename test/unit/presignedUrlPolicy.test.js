import assert from "node:assert/strict";
import { test } from "node:test";
import { KsefClient, KsefValidationError } from "../../dist/index.js";

test("skipAuth rejects host normalized to empty value", async () => {
  const client = new KsefClient({ baseUrl: "https://api-test.ksef.mf.gov.pl/v2" });

  await assert.rejects(
    () =>
      client.http.request({
        method: "GET",
        path: "https://./export-part.bin",
        skipAuth: true,
      }),
    /host is missing/,
  );
});

test("skipAuth rejects loopback and internal IPv4 hosts", async () => {
  const client = new KsefClient({ baseUrl: "https://api-test.ksef.mf.gov.pl/v2" });
  const cases = [
    { url: "https://127.0.0.1/export-part.bin", pattern: /loopback addresses are not allowed/ },
    {
      url: "https://10.20.30.40/export-part.bin",
      pattern: /private, link-local, and reserved IP hosts are blocked/,
    },
    {
      url: "https://169.254.1.2/export-part.bin",
      pattern: /private, link-local, and reserved IP hosts are blocked/,
    },
    {
      url: "https://203.0.113.55/export-part.bin",
      pattern: /private, link-local, and reserved IP hosts are blocked/,
    },
  ];

  for (const item of cases) {
    await assert.rejects(
      () =>
        client.http.request({
          method: "GET",
          path: item.url,
          skipAuth: true,
        }),
      item.pattern,
    );
  }
});

test("skipAuth rejects localhost subdomains", async () => {
  const client = new KsefClient({ baseUrl: "https://api-test.ksef.mf.gov.pl/v2" });
  await assert.rejects(
    () =>
      client.http.request({
        method: "GET",
        path: "https://api.localhost/export-part.bin",
        skipAuth: true,
      }),
    /localhost hosts are not allowed/,
  );
});

test("skipAuth allows allowlisted subdomain and fails later on network resolution", async () => {
  const client = new KsefClient({
    baseUrl: "https://api-test.ksef.mf.gov.pl/v2",
    allowedPresignedHosts: ["example.invalid"],
  });

  await assert.rejects(
    () =>
      client.http.request({
        method: "GET",
        path: "https://sub.example.invalid/export-part.bin",
        skipAuth: true,
      }),
    (error) => {
      assert.ok(!(error instanceof KsefValidationError));
      return true;
    },
  );
});

test("skipAuth with strict validation disabled allows http URL and fails outside validation", async () => {
  const client = new KsefClient({
    baseUrl: "https://api-test.ksef.mf.gov.pl/v2",
    strictPresignedUrlValidation: false,
  });

  await assert.rejects(
    () =>
      client.http.request({
        method: "GET",
        path: "http://sub.example.invalid/export-part.bin",
        skipAuth: true,
      }),
    (error) => {
      assert.ok(!(error instanceof KsefValidationError));
      return true;
    },
  );
});
