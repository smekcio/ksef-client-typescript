import assert from "node:assert/strict";
import { test } from "node:test";
import { TestdataClient } from "../../dist/index.js";

test("blockContext sends request to /testdata/context/block with request body", async () => {
  const requestBody = { contextIdentifier: { type: "Nip", value: "1111111111" } };
  let capturedOptions;
  const http = {
    request: async (options) => {
      capturedOptions = options;
      return {};
    },
  };
  const client = new TestdataClient(http, async () => "access-token");

  await client.blockContext(requestBody);

  assert.equal(capturedOptions.path, "/testdata/context/block");
  assert.deepEqual(capturedOptions.body, requestBody);
});

test("unblockContext sends request to /testdata/context/unblock", async () => {
  const requestBody = { contextIdentifier: { type: "Nip", value: "1111111111" } };
  let capturedOptions;
  const http = {
    request: async (options) => {
      capturedOptions = options;
      return {};
    },
  };
  const client = new TestdataClient(http, async () => "access-token");

  await client.unblockContext(requestBody);

  assert.equal(capturedOptions.path, "/testdata/context/unblock");
  assert.deepEqual(capturedOptions.body, requestBody);
});

test("testdata endpoints use expected paths and body forwarding", async () => {
  const calls = [];
  const http = {
    request: async (options) => {
      calls.push(options);
      return {};
    },
  };
  const client = new TestdataClient(http, async () => "access-token");
  const request = { contextIdentifier: { type: "Nip", value: "1111111111" } };

  await client.enableAttachments(request);
  await client.revokeAttachments(request);
  await client.grantPermissions(request);
  await client.revokePermissions(request);
  await client.createPerson(request);
  await client.removePerson(request);
  await client.createSubject(request);
  await client.removeSubject(request);

  assert.deepEqual(
    calls.map((options) => [options.method, options.path, options.authToken]),
    [
      ["POST", "/testdata/attachment", "access-token"],
      ["POST", "/testdata/attachment/revoke", "access-token"],
      ["POST", "/testdata/permissions", "access-token"],
      ["POST", "/testdata/permissions/revoke", "access-token"],
      ["POST", "/testdata/person", "access-token"],
      ["POST", "/testdata/person/remove", "access-token"],
      ["POST", "/testdata/subject", "access-token"],
      ["POST", "/testdata/subject/remove", "access-token"],
    ],
  );
  for (const options of calls) {
    assert.deepEqual(options.body, request);
  }
});

test("updateCertificate puts to /testdata/certificates/{serialNumber}", async () => {
  let capturedOptions;
  const http = {
    request: async (options) => {
      capturedOptions = options;
      return undefined;
    },
  };
  const client = new TestdataClient(http, async () => "access-token");
  const request = { validTo: "2026-12-31T23:59:59Z" };

  await client.updateCertificate("0123456789ABCDEF", request);

  assert.equal(capturedOptions.method, "PUT");
  assert.equal(capturedOptions.path, "/testdata/certificates/0123456789ABCDEF");
  assert.deepEqual(capturedOptions.body, request);
  assert.equal(capturedOptions.authToken, "access-token");
});

test("updateCertificate rejects invalid serial number", async () => {
  const client = new TestdataClient({ request: async () => undefined }, async () => "access-token");

  await assert.rejects(
    () => client.updateCertificate("bad", { validTo: "2026-12-31T23:59:59Z" }),
    /Invalid certificate serial number/,
  );
});
