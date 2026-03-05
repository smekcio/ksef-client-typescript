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
    {
      url: "https://224.0.0.1/export-part.bin",
      pattern: /private, link-local, and reserved IP hosts are blocked/,
    },
    {
      url: "https://100.64.0.1/export-part.bin",
      pattern: /private, link-local, and reserved IP hosts are blocked/,
    },
    {
      url: "https://192.0.0.1/export-part.bin",
      pattern: /private, link-local, and reserved IP hosts are blocked/,
    },
    {
      url: "https://192.0.2.1/export-part.bin",
      pattern: /private, link-local, and reserved IP hosts are blocked/,
    },
    {
      url: "https://198.18.0.1/export-part.bin",
      pattern: /private, link-local, and reserved IP hosts are blocked/,
    },
    {
      url: "https://198.51.100.1/export-part.bin",
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

test("skipAuth rejects private and reserved IPv6 hosts by default", async () => {
  const client = new KsefClient({ baseUrl: "https://api-test.ksef.mf.gov.pl/v2" });
  const urls = [
    "https://[::1]/export-part.bin",
    "https://[fc00::1]/export-part.bin",
    "https://[fd00::1]/export-part.bin",
    "https://[fe80::1]/export-part.bin",
    "https://[ff00::1]/export-part.bin",
    "https://[2001:db8::1]/export-part.bin",
    "https://[::]/export-part.bin",
  ];

  for (const url of urls) {
    await assert.rejects(
      () =>
        client.http.request({
          method: "GET",
          path: url,
          skipAuth: true,
        }),
      KsefValidationError,
    );
  }
});

test("skipAuth allows exact allowlisted host and public IPv4 hosts", async () => {
  const allowlisted = new KsefClient({
    baseUrl: "https://api-test.ksef.mf.gov.pl/v2",
    allowedPresignedHosts: ["example.invalid"],
  });
  await assert.rejects(
    () =>
      allowlisted.http.request({
        method: "GET",
        path: "https://example.invalid/export-part.bin",
        skipAuth: true,
      }),
    (error) => {
      assert.ok(!(error instanceof KsefValidationError));
      return true;
    },
  );

  const publicIpv4 = new KsefClient({
    baseUrl: "https://api-test.ksef.mf.gov.pl/v2",
    timeoutMs: 50,
  });
  await assert.rejects(
    () =>
      publicIpv4.http.request({
        method: "GET",
        path: "https://8.8.8.8/export-part.bin",
        skipAuth: true,
      }),
    (error) => {
      assert.ok(!(error instanceof KsefValidationError));
      return true;
    },
  );
});

test("skipAuth allows private network URLs when explicitly enabled", async () => {
  const client = new KsefClient({
    baseUrl: "https://api-test.ksef.mf.gov.pl/v2",
    allowPrivateNetworkPresignedUrls: true,
    timeoutMs: 50,
  });

  await assert.rejects(
    () =>
      client.http.request({
        method: "GET",
        path: "https://10.10.10.10/export-part.bin",
        skipAuth: true,
      }),
    (error) => {
      assert.ok(!(error instanceof KsefValidationError));
      return true;
    },
  );
});

test("skipAuth rejects malformed URLs", async () => {
  const client = new KsefClient({ baseUrl: "https://api-test.ksef.mf.gov.pl/v2" });
  await assert.rejects(
    () =>
      client.http.request({
        method: "GET",
        path: "https://[::gg]/export-part.bin",
        skipAuth: true,
      }),
    /Invalid URL/,
  );
});

test("skipAuth surfaces presigned parser error when URL constructor fails in validation step", async () => {
  const client = new KsefClient({ baseUrl: "https://api-test.ksef.mf.gov.pl/v2" });
  const OriginalURL = URL;
  let calls = 0;

  class PatchedURL extends OriginalURL {
    constructor(...args) {
      calls += 1;
      if (calls >= 2) {
        throw new Error("forced-url-parse-failure");
      }
      super(...args);
    }

    static canParse(url, base) {
      return OriginalURL.canParse(url, base);
    }

    static createObjectURL(value) {
      return OriginalURL.createObjectURL(value);
    }

    static revokeObjectURL(value) {
      return OriginalURL.revokeObjectURL(value);
    }
  }

  // eslint-disable-next-line no-global-assign
  URL = PatchedURL;
  try {
    await assert.rejects(
      () =>
        client.http.request({
          method: "GET",
          path: "https://example.invalid/export-part.bin",
          skipAuth: true,
        }),
      /invalid URL/,
    );
  } finally {
    // eslint-disable-next-line no-global-assign
    URL = OriginalURL;
  }
});

test("skipAuth covers reserved-ip fallback branch when IPv4 split metadata is malformed", async () => {
  const client = new KsefClient({
    baseUrl: "https://api-test.ksef.mf.gov.pl/v2",
    allowPrivateNetworkPresignedUrls: true,
    timeoutMs: 30,
  });
  const originalSplit = String.prototype.split;
  String.prototype.split = function patchedSplit(separator, limit) {
    if (this.valueOf() === "8.8.8.8" && separator === ".") {
      return [];
    }
    return originalSplit.call(this, separator, limit);
  };

  try {
    await assert.rejects(
      () =>
        client.http.request({
          method: "GET",
          path: "https://8.8.8.8/export-part.bin",
          skipAuth: true,
        }),
      (error) => {
        assert.ok(!(error instanceof KsefValidationError));
        return true;
      },
    );
  } finally {
    String.prototype.split = originalSplit;
  }
});

test("skipAuth covers private/reserved IPv4 parser edge branches for unusual octet extraction", async () => {
  const client = new KsefClient({
    baseUrl: "https://api-test.ksef.mf.gov.pl/v2",
    timeoutMs: 20,
  });
  const originalSplit = String.prototype.split;
  String.prototype.split = function patchedSplit(separator, limit) {
    if (separator === ".") {
      const value = this.valueOf();
      if (value === "172.20.0.1") {
        return ["172"];
      }
      if (value === "8.8.8.8") {
        return ["8", "8"];
      }
    }
    return originalSplit.call(this, separator, limit);
  };

  try {
    await assert.rejects(
      () =>
        client.http.request({
          method: "GET",
          path: "https://172.16.0.1/export-part.bin",
          skipAuth: true,
        }),
      /private, link-local, and reserved IP hosts are blocked/,
    );

    for (const url of [
      "https://172.10.0.1/export-part.bin",
      "https://172.40.0.1/export-part.bin",
      "https://172.20.0.1/export-part.bin",
      "https://8.8.8.8/export-part.bin",
    ]) {
      await assert.rejects(
        () =>
          client.http.request({
            method: "GET",
            path: url,
            skipAuth: true,
          }),
        (error) => {
          assert.ok(!(error instanceof KsefValidationError));
          return true;
        },
      );
    }
  } finally {
    String.prototype.split = originalSplit;
  }
});
