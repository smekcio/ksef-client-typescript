import assert from "node:assert/strict";
import { test } from "node:test";
import { PermissionsClient } from "../../dist/index.js";

test("queryPersonsGrants sends pagination in query params", async () => {
  let capturedOptions;
  const http = {
    request: async (options) => {
      capturedOptions = options;
      return {};
    },
  };
  const client = new PermissionsClient(http, async () => "access-token");
  const request = { queryCriteria: { personIdentifier: { type: "Pesel", value: "90010112345" } } };

  await client.queryPersonsGrants(request, 0, 50);

  assert.equal(capturedOptions.method, "POST");
  assert.equal(capturedOptions.path, "/permissions/query/persons/grants");
  assert.deepEqual(capturedOptions.query, {
    pageOffset: 0,
    pageSize: 50,
  });
  assert.deepEqual(capturedOptions.body, request);
});

test("queryEntitiesRoles sends pagination in query params", async () => {
  let capturedOptions;
  const http = {
    request: async (options) => {
      capturedOptions = options;
      return {};
    },
  };
  const client = new PermissionsClient(http, async () => "access-token");

  await client.queryEntitiesRoles(100, 20);

  assert.equal(capturedOptions.method, "GET");
  assert.equal(capturedOptions.path, "/permissions/query/entities/roles");
  assert.deepEqual(capturedOptions.query, {
    pageOffset: 100,
    pageSize: 20,
  });
});
