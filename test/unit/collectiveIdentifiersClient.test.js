import assert from "node:assert/strict";
import { test } from "node:test";
import { CollectiveIdentifiersClient } from "../../dist/index.js";

const VALID_IZ = "5265877635-IZ202508-0100001AF629-FC";
const VALID_KSEF = "5265877635-20250826-0100001AF629-AF";

test("generate posts to /collective-identifiers", async () => {
  let capturedOptions;
  const http = {
    request: async (options) => {
      capturedOptions = options;
      return { collectiveIdentifierNumber: VALID_IZ };
    },
  };
  const client = new CollectiveIdentifiersClient(http, async () => "access-token");
  const request = { invoices: [{ ksefNumber: VALID_KSEF }] };

  const response = await client.generate(request);

  assert.equal(capturedOptions.method, "POST");
  assert.equal(capturedOptions.path, "/collective-identifiers");
  assert.deepEqual(capturedOptions.body, request);
  assert.equal(capturedOptions.authToken, "access-token");
  assert.equal(response.collectiveIdentifierNumber, VALID_IZ);
});

test("query posts to /collective-identifiers/query with paging", async () => {
  let capturedOptions;
  const http = {
    request: async (options) => {
      capturedOptions = options;
      return { collectiveIdentifiers: [] };
    },
  };
  const client = new CollectiveIdentifiersClient(http, async () => "access-token");
  const request = {
    dateCreatedFrom: "2026-01-01T00:00:00Z",
    dateCreatedTo: "2026-01-31T23:59:59Z",
  };

  await client.query(request, { pageSize: 10, continuationToken: "token-1" });

  assert.equal(capturedOptions.method, "POST");
  assert.equal(capturedOptions.path, "/collective-identifiers/query");
  assert.deepEqual(capturedOptions.body, request);
  assert.deepEqual(capturedOptions.query, { pageSize: 10 });
  assert.deepEqual(capturedOptions.headers, { "x-continuation-token": "token-1" });
});

test("query works without paging options", async () => {
  let capturedOptions;
  const http = {
    request: async (options) => {
      capturedOptions = options;
      return { collectiveIdentifiers: [] };
    },
  };
  const client = new CollectiveIdentifiersClient(http, async () => "access-token");
  const request = {
    dateCreatedFrom: "2026-01-01T00:00:00Z",
    dateCreatedTo: "2026-01-31T23:59:59Z",
  };

  await client.query(request);

  assert.equal(capturedOptions.method, "POST");
  assert.equal(capturedOptions.path, "/collective-identifiers/query");
  assert.equal(capturedOptions.query, undefined);
  assert.equal(capturedOptions.headers, undefined);
});

test("listInvoices gets invoices for collective identifier", async () => {
  let capturedOptions;
  const http = {
    request: async (options) => {
      capturedOptions = options;
      return { invoices: [] };
    },
  };
  const client = new CollectiveIdentifiersClient(http, async () => "access-token");

  await client.listInvoices(VALID_IZ, { pageSize: 5, continuationToken: "tok" });

  assert.equal(capturedOptions.method, "GET");
  assert.equal(
    capturedOptions.path,
    `/collective-identifiers/${encodeURIComponent(VALID_IZ)}/invoices`,
  );
  assert.deepEqual(capturedOptions.query, { pageSize: 5 });
  assert.deepEqual(capturedOptions.headers, { "x-continuation-token": "tok" });
});

test("listInvoices works without paging options", async () => {
  let capturedOptions;
  const http = {
    request: async (options) => {
      capturedOptions = options;
      return { invoices: [] };
    },
  };
  const client = new CollectiveIdentifiersClient(http, async () => "access-token");

  await client.listInvoices(VALID_IZ);

  assert.equal(capturedOptions.query, undefined);
  assert.equal(capturedOptions.headers, undefined);
});

test("listInvoices rejects invalid collective identifier", async () => {
  const client = new CollectiveIdentifiersClient(
    { request: async () => ({}) },
    async () => "access-token",
  );

  await assert.rejects(() => client.listInvoices("bad"), /Invalid collective identifier number/);
});

test("listByKsefNumber gets identifiers for KSeF number", async () => {
  let capturedOptions;
  const http = {
    request: async (options) => {
      capturedOptions = options;
      return { collectiveIdentifiers: [] };
    },
  };
  const client = new CollectiveIdentifiersClient(http, async () => "access-token");

  await client.listByKsefNumber(VALID_KSEF, { pageSize: 3, continuationToken: "next" });

  assert.equal(capturedOptions.method, "GET");
  assert.equal(
    capturedOptions.path,
    `/collective-identifiers/ksef/${encodeURIComponent(VALID_KSEF)}`,
  );
  assert.deepEqual(capturedOptions.query, { pageSize: 3 });
  assert.deepEqual(capturedOptions.headers, { "x-continuation-token": "next" });
});

test("listByKsefNumber works without paging options", async () => {
  let capturedOptions;
  const http = {
    request: async (options) => {
      capturedOptions = options;
      return { collectiveIdentifiers: [] };
    },
  };
  const client = new CollectiveIdentifiersClient(http, async () => "access-token");

  await client.listByKsefNumber(VALID_KSEF);

  assert.equal(capturedOptions.query, undefined);
  assert.equal(capturedOptions.headers, undefined);
});

test("listByKsefNumber uses normalized 35-char KSeF number in path", async () => {
  let capturedOptions;
  const http = {
    request: async (options) => {
      capturedOptions = options;
      return { collectiveIdentifiers: [] };
    },
  };
  const client = new CollectiveIdentifiersClient(http, async () => "access-token");
  const withExtraSeparator = "5265877635-20250826-0100001A-F629-AF";

  await client.listByKsefNumber(withExtraSeparator);

  assert.equal(
    capturedOptions.path,
    `/collective-identifiers/ksef/${encodeURIComponent(VALID_KSEF)}`,
  );
});

test("listByKsefNumber rejects invalid KSeF number", async () => {
  const client = new CollectiveIdentifiersClient(
    { request: async () => ({}) },
    async () => "access-token",
  );

  await assert.rejects(() => client.listByKsefNumber("bad"), /Invalid KSeF number/);
});
