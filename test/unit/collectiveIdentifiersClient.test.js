import assert from "node:assert/strict";
import { test } from "node:test";
import { CollectiveIdentifiersClient } from "../../dist/index.js";

const VALID_IZ = "5265877635-IZ202508-0100001AF629-FC";
const VALID_IZ_2 = "5265877635-IZ202509-0100001AF629-19";
const VALID_KSEF = "5265877635-20250826-0100001AF629-AF";
const VALID_KSEF_2 = "5265877635-20250827-0100001AF629-4A";

function createClient(handler) {
  return new CollectiveIdentifiersClient({ request: handler }, async () => "access-token");
}

test("generate posts to /collective-identifiers after fail-fast invoice validation", async () => {
  let capturedOptions;
  const client = createClient(async (options) => {
    capturedOptions = options;
    return { collectiveIdentifierNumber: VALID_IZ };
  });
  const request = {
    invoices: [{ ksefNumber: VALID_KSEF }, { ksefNumber: VALID_KSEF_2 }],
  };

  const response = await client.generate(request);

  assert.equal(capturedOptions.method, "POST");
  assert.equal(capturedOptions.path, "/collective-identifiers");
  assert.deepEqual(capturedOptions.body, request);
  assert.equal(capturedOptions.authToken, "access-token");
  assert.equal(response.collectiveIdentifierNumber, VALID_IZ);
});

test("generate rejects fewer than two invoices before HTTP", async () => {
  const client = createClient(async () => {
    throw new Error("should not be called");
  });
  await assert.rejects(
    () => client.generate({ invoices: [{ ksefNumber: VALID_KSEF }] }),
    /at least 2 invoices/,
  );
});

test("generateForKsefNumbers maps numbers without descriptions", async () => {
  let capturedOptions;
  const client = createClient(async (options) => {
    capturedOptions = options;
    return { collectiveIdentifierNumber: VALID_IZ };
  });

  await client.generateForKsefNumbers([VALID_KSEF, VALID_KSEF_2]);

  assert.deepEqual(capturedOptions.body.invoices, [
    { ksefNumber: VALID_KSEF },
    { ksefNumber: VALID_KSEF_2 },
  ]);
});

test("generateForKsefNumbers maps numbers and optional descriptions", async () => {
  let capturedOptions;
  const client = createClient(async (options) => {
    capturedOptions = options;
    return { collectiveIdentifierNumber: VALID_IZ };
  });

  await client.generateForKsefNumbers([VALID_KSEF, VALID_KSEF_2], {
    descriptions: ["first", null],
  });

  assert.equal(capturedOptions.path, "/collective-identifiers");
  assert.deepEqual(capturedOptions.body.invoices, [
    { ksefNumber: VALID_KSEF, description: "first" },
    { ksefNumber: VALID_KSEF_2, description: null },
  ]);
});

test("generateForKsefNumbers rejects mismatched descriptions", async () => {
  const client = createClient(async () => ({}));
  await assert.rejects(
    () =>
      client.generateForKsefNumbers([VALID_KSEF, VALID_KSEF_2], {
        descriptions: ["only-one"],
      }),
    /descriptions length must match ksef_numbers/,
  );
});

test("query posts to /collective-identifiers/query with paging", async () => {
  let capturedOptions;
  const client = createClient(async (options) => {
    capturedOptions = options;
    return { collectiveIdentifiers: [] };
  });
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

test("query works without paging options and validates identifier filter", async () => {
  let capturedOptions;
  const client = createClient(async (options) => {
    capturedOptions = options;
    return { collectiveIdentifiers: [] };
  });
  const request = {
    dateCreatedFrom: "2026-01-01T00:00:00Z",
    dateCreatedTo: "2026-01-31T23:59:59Z",
    collectiveIdentifierNumber: VALID_IZ,
  };

  await client.query(request);

  assert.equal(capturedOptions.method, "POST");
  assert.equal(capturedOptions.path, "/collective-identifiers/query");
  assert.equal(capturedOptions.query, undefined);
  assert.equal(capturedOptions.headers, undefined);
});

test("query rejects an oversized created range", async () => {
  const client = createClient(async () => ({}));
  await assert.rejects(
    () =>
      client.query({
        dateCreatedFrom: "2026-01-01T00:00:00Z",
        dateCreatedTo: "2026-05-01T00:00:00Z",
      }),
    /cannot exceed 100 days/,
  );
});

test("queryByCreatedRange expands date-only bounds", async () => {
  let capturedOptions;
  const client = createClient(async (options) => {
    capturedOptions = options;
    return { collectiveIdentifiers: [] };
  });

  await client.queryByCreatedRange("2026-01-01", "2026-01-02", {
    collectiveIdentifierNumber: VALID_IZ,
    createdInCurrentContext: true,
    invoiceCountFrom: 2,
    invoiceCountTo: 10,
    pageSize: 20,
  });

  assert.deepEqual(capturedOptions.body, {
    dateCreatedFrom: "2026-01-01T00:00:00Z",
    dateCreatedTo: "2026-01-02T23:59:59Z",
    collectiveIdentifierNumber: VALID_IZ,
    createdInCurrentContext: true,
    invoiceCountFrom: 2,
    invoiceCountTo: 10,
  });
  assert.deepEqual(capturedOptions.query, { pageSize: 20 });
});

test("queryByCreatedRange works with date-only bounds and no extra filters", async () => {
  let capturedOptions;
  const client = createClient(async (options) => {
    capturedOptions = options;
    return { collectiveIdentifiers: [] };
  });

  await client.queryByCreatedRange("2026-01-01", "2026-01-02");

  assert.deepEqual(capturedOptions.body, {
    dateCreatedFrom: "2026-01-01T00:00:00Z",
    dateCreatedTo: "2026-01-02T23:59:59Z",
  });
});

test("listInvoices posts up to 10 identifiers", async () => {
  let capturedOptions;
  const client = createClient(async (options) => {
    capturedOptions = options;
    return { invoices: [] };
  });

  await client.listInvoices([VALID_IZ, VALID_IZ_2], { pageSize: 10, continuationToken: "tok" });

  assert.equal(capturedOptions.method, "POST");
  assert.equal(capturedOptions.path, "/collective-identifiers/invoices");
  assert.deepEqual(capturedOptions.body, {
    collectiveIdentifierNumbers: [VALID_IZ, VALID_IZ_2],
  });
  assert.deepEqual(capturedOptions.query, { pageSize: 10 });
  assert.deepEqual(capturedOptions.headers, { "x-continuation-token": "tok" });
});

test("listInvoices accepts a single identifier string without paging", async () => {
  let capturedOptions;
  const client = createClient(async (options) => {
    capturedOptions = options;
    return { invoices: [] };
  });

  await client.listInvoices(VALID_IZ);

  assert.equal(capturedOptions.method, "POST");
  assert.equal(capturedOptions.path, "/collective-identifiers/invoices");
  assert.deepEqual(capturedOptions.body, { collectiveIdentifierNumbers: [VALID_IZ] });
  assert.equal(capturedOptions.query, undefined);
  assert.equal(capturedOptions.headers, undefined);
});

test("listInvoices rejects invalid collective identifier", async () => {
  const client = createClient(async () => ({}));
  await assert.rejects(() => client.listInvoices("bad"), /Invalid collective identifier number/);
});

test("listInvoices validates invoices pageSize 10-500", async () => {
  const client = createClient(async () => ({ invoices: [] }));
  await assert.rejects(
    () => client.listInvoices(VALID_IZ, { pageSize: 5 }),
    /page_size must be between 10 and 500/,
  );
  await client.listInvoices(VALID_IZ, { pageSize: 500 });
});

test("listByKsefNumber gets identifiers for KSeF number", async () => {
  let capturedOptions;
  const client = createClient(async (options) => {
    capturedOptions = options;
    return { collectiveIdentifiers: [] };
  });

  await client.listByKsefNumber(VALID_KSEF, { pageSize: 10, continuationToken: "next" });

  assert.equal(capturedOptions.method, "GET");
  assert.equal(
    capturedOptions.path,
    `/collective-identifiers/ksef/${encodeURIComponent(VALID_KSEF)}`,
  );
  assert.deepEqual(capturedOptions.query, { pageSize: 10 });
  assert.deepEqual(capturedOptions.headers, { "x-continuation-token": "next" });
});

test("listByKsefNumber works without paging options", async () => {
  let capturedOptions;
  const client = createClient(async (options) => {
    capturedOptions = options;
    return { collectiveIdentifiers: [] };
  });

  await client.listByKsefNumber(VALID_KSEF);

  assert.equal(capturedOptions.query, undefined);
  assert.equal(capturedOptions.headers, undefined);
});

test("listByKsefNumber uses normalized 35-char KSeF number in path", async () => {
  let capturedOptions;
  const client = createClient(async (options) => {
    capturedOptions = options;
    return { collectiveIdentifiers: [] };
  });
  const withExtraSeparator = "5265877635-20250826-0100001A-F629-AF";

  await client.listByKsefNumber(withExtraSeparator);

  assert.equal(
    capturedOptions.path,
    `/collective-identifiers/ksef/${encodeURIComponent(VALID_KSEF)}`,
  );
});

test("listByKsefNumber rejects invalid KSeF number", async () => {
  const client = createClient(async () => ({}));
  await assert.rejects(() => client.listByKsefNumber("bad"), /Invalid KSeF number/);
});

test("iterators follow continuation tokens and stop on repeats", async () => {
  const queryCalls = [];
  const invoiceCalls = [];
  const byKsefCalls = [];
  const client = createClient(async (options) => {
    if (options.path === "/collective-identifiers/query") {
      queryCalls.push(options.headers?.["x-continuation-token"]);
      if (queryCalls.length === 1) {
        return {
          collectiveIdentifiers: [{ collectiveIdentifierNumber: VALID_IZ, invoiceCount: 2 }],
          continuationToken: "q2",
        };
      }
      return {
        collectiveIdentifiers: [{ collectiveIdentifierNumber: VALID_IZ_2, invoiceCount: 3 }],
        continuationToken: "q2",
      };
    }
    if (options.path === "/collective-identifiers/invoices") {
      invoiceCalls.push(options.headers?.["x-continuation-token"]);
      if (invoiceCalls.length === 1) {
        return { invoices: [{ ksefNumber: VALID_KSEF }], continuationToken: "i2" };
      }
      return { invoices: [{ ksefNumber: VALID_KSEF_2 }] };
    }
    byKsefCalls.push(options.headers?.["x-continuation-token"]);
    if (byKsefCalls.length === 1) {
      return {
        collectiveIdentifiers: [{ collectiveIdentifierNumber: VALID_IZ }],
        continuationToken: "b2",
      };
    }
    return { collectiveIdentifiers: [{ collectiveIdentifierNumber: VALID_IZ_2 }] };
  });

  const queryItems = [];
  for await (const item of client.iterQuery({
    dateCreatedFrom: "2026-01-01T00:00:00Z",
    dateCreatedTo: "2026-01-31T23:59:59Z",
  })) {
    queryItems.push(item.collectiveIdentifierNumber);
  }
  const invoiceItems = [];
  for await (const item of client.iterInvoices(VALID_IZ)) {
    invoiceItems.push(item.ksefNumber);
  }
  const byKsefItems = [];
  for await (const item of client.iterByKsefNumber(VALID_KSEF)) {
    byKsefItems.push(item.collectiveIdentifierNumber);
  }

  assert.deepEqual(queryItems, [VALID_IZ, VALID_IZ_2]);
  assert.deepEqual(invoiceItems, [VALID_KSEF, VALID_KSEF_2]);
  assert.deepEqual(byKsefItems, [VALID_IZ, VALID_IZ_2]);
});

test("iterators treat missing item arrays as empty pages", async () => {
  const client = createClient(async (options) => {
    if (options.path === "/collective-identifiers/query") {
      return { continuationToken: "" };
    }
    if (options.path === "/collective-identifiers/invoices") {
      return {};
    }
    return { collectiveIdentifiers: undefined };
  });

  const queryItems = [];
  for await (const item of client.iterQuery({
    dateCreatedFrom: "2026-01-01T00:00:00Z",
    dateCreatedTo: "2026-01-31T23:59:59Z",
  })) {
    queryItems.push(item);
  }
  const invoiceItems = [];
  for await (const item of client.iterInvoices(VALID_IZ, { pageSize: 10 })) {
    invoiceItems.push(item);
  }
  const byKsefItems = [];
  for await (const item of client.iterByKsefNumber(VALID_KSEF, { pageSize: 10 })) {
    byKsefItems.push(item);
  }

  assert.deepEqual(queryItems, []);
  assert.deepEqual(invoiceItems, []);
  assert.deepEqual(byKsefItems, []);
});
