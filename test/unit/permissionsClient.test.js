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

test("queryAuthorizations omits query params when pagination is not provided", async () => {
  let capturedOptions;
  const http = {
    request: async (options) => {
      capturedOptions = options;
      return {};
    },
  };
  const client = new PermissionsClient(http, async () => "access-token");
  const request = { queryCriteria: { grantStatus: ["Active"] } };

  await client.queryAuthorizations(request);

  assert.equal(capturedOptions.method, "POST");
  assert.equal(capturedOptions.path, "/permissions/query/authorizations/grants");
  assert.equal("query" in capturedOptions, false);
  assert.deepEqual(capturedOptions.body, request);
});

test("queryEntitiesRoles omits query params when pagination is not provided", async () => {
  let capturedOptions;
  const http = {
    request: async (options) => {
      capturedOptions = options;
      return {};
    },
  };
  const client = new PermissionsClient(http, async () => "access-token");

  await client.queryEntitiesRoles();

  assert.equal(capturedOptions.method, "GET");
  assert.equal(capturedOptions.path, "/permissions/query/entities/roles");
  assert.equal("query" in capturedOptions, false);
});

test("permissions operations and query endpoints use expected methods and paths", async () => {
  const calls = [];
  const http = {
    request: async (options) => {
      calls.push(options);
      return {};
    },
  };
  const client = new PermissionsClient(http, async () => "access-token");
  const grantRequest = {
    contextIdentifier: { type: "Nip", value: "1234567890" },
    permissions: [],
  };
  const queryRequest = { queryCriteria: { grantStatus: ["Active"] } };

  await client.grantAuthorizations(grantRequest);
  await client.grantEntities(grantRequest);
  await client.grantEuEntitiesAdministration(grantRequest);
  await client.grantEuEntities(grantRequest);
  await client.grantIndirect(grantRequest);
  await client.grantPersons(grantRequest);
  await client.grantSubunits(grantRequest);
  await client.revokeAuthorizationGrant("AUTH/1");
  await client.revokeCommonGrant("COM/2");
  await client.queryEuEntitiesGrants(queryRequest, 1, 2);
  await client.queryPersonalGrants(queryRequest, 3, 4);
  await client.querySubordinateEntitiesRoles(queryRequest, 5, 6);
  await client.querySubunitsGrants(queryRequest, 7, 8);
  await client.getAttachmentPermissionStatus();
  await client.getOperationStatus("OP/99");

  assert.deepEqual(
    calls.map((options) => [options.method, options.path]),
    [
      ["POST", "/permissions/authorizations/grants"],
      ["POST", "/permissions/entities/grants"],
      ["POST", "/permissions/eu-entities/administration/grants"],
      ["POST", "/permissions/eu-entities/grants"],
      ["POST", "/permissions/indirect/grants"],
      ["POST", "/permissions/persons/grants"],
      ["POST", "/permissions/subunits/grants"],
      ["DELETE", "/permissions/authorizations/grants/AUTH%2F1"],
      ["DELETE", "/permissions/common/grants/COM%2F2"],
      ["POST", "/permissions/query/eu-entities/grants"],
      ["POST", "/permissions/query/personal/grants"],
      ["POST", "/permissions/query/subordinate-entities/roles"],
      ["POST", "/permissions/query/subunits/grants"],
      ["GET", "/permissions/attachments/status"],
      ["GET", "/permissions/operations/OP%2F99"],
    ],
  );
  assert.deepEqual(calls[0].body, grantRequest);
  assert.deepEqual(calls[9].query, { pageOffset: 1, pageSize: 2 });
  assert.deepEqual(calls[10].query, { pageOffset: 3, pageSize: 4 });
  assert.deepEqual(calls[11].query, { pageOffset: 5, pageSize: 6 });
  assert.deepEqual(calls[12].query, { pageOffset: 7, pageSize: 8 });
});
