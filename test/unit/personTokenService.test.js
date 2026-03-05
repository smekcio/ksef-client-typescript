import assert from "node:assert/strict";
import { test } from "node:test";
import { PersonTokenService } from "../../dist/index.js";

function buildJwt(payload) {
  const header = { alg: "none", typ: "JWT" };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encodedHeader}.${encodedPayload}.signature`;
}

test("PersonTokenService parses token claims and normalizes role-related fields", () => {
  const service = new PersonTokenService();
  const token = buildJwt({
    iss: "https://issuer.example",
    aud: ["ksef", "portal"],
    iat: "1700000000",
    exp: 1700003600,
    typ: "Access",
    cit: "Nip",
    civ: "1111111111",
    aum: "Token",
    arn: "REF-123",
    sud: '{"subject":"Acme Sp. z o.o."}',
    ipp: '{"ip4Addresses":["10.0.0.1"]}',
    per: '["invoice:read","invoice:write"]',
    pec: '"[\\"invoice:delete\\"]"',
    rol: '["Operator","Auditor"]',
    pep: '["invoice:read"]',
    role: "LegacyRole",
    permissions: ["LegacyPermission", "invoice:read"],
  });

  const parsed = service.parse(token);
  assert.equal(parsed.issuer, "https://issuer.example");
  assert.deepEqual(parsed.audiences, ["ksef", "portal"]);
  assert.equal(parsed.issuedAt?.toISOString(), "2023-11-14T22:13:20.000Z");
  assert.equal(parsed.expiresAt?.toISOString(), "2023-11-14T23:13:20.000Z");
  assert.equal(parsed.tokenType, "Access");
  assert.equal(parsed.contextIdType, "Nip");
  assert.equal(parsed.contextIdValue, "1111111111");
  assert.equal(parsed.authMethod, "Token");
  assert.equal(parsed.authRequestNumber, "REF-123");
  assert.deepEqual(parsed.subjectDetails, { subject: "Acme Sp. z o.o." });
  assert.deepEqual(parsed.ipPolicy, { ip4Addresses: ["10.0.0.1"] });
  assert.deepEqual(parsed.permissions, ["invoice:read", "invoice:write"]);
  assert.deepEqual(parsed.permissionsExcluded, ["invoice:delete"]);
  assert.deepEqual(parsed.rolesRaw, ["Operator", "Auditor"]);
  assert.deepEqual(parsed.permissionsEffective, ["invoice:read"]);
  assert.deepEqual(parsed.roles, [
    "LegacyRole",
    "LegacyPermission",
    "invoice:read",
    "invoice:write",
    "Operator",
    "Auditor",
  ]);
});

test("PersonTokenService throws on malformed JWT", () => {
  const service = new PersonTokenService();
  assert.throws(() => service.parse("invalid-token"), /Invalid JWT format/);
  assert.throws(() => service.parse("a..c"), /Invalid JWT format/);
});

test("PersonTokenService handles missing and malformed optional claims", () => {
  const service = new PersonTokenService();
  const token = buildJwt({
    aud: "single-audience",
    exp: "",
    iat: "not-a-number",
    typ: "",
    civ: 0,
    sud: "not-json",
    per: 'one,two,,"three"',
    pec: "single",
    rol: '"\\uZZZZ"',
    pep: null,
  });

  const parsed = service.parse(token);
  assert.equal(parsed.issuer, null);
  assert.deepEqual(parsed.audiences, ["single-audience"]);
  assert.equal(parsed.issuedAt, null);
  assert.equal(parsed.expiresAt, null);
  assert.equal(parsed.tokenType, null);
  assert.equal(parsed.contextIdType, null);
  assert.equal(parsed.contextIdValue, null);
  assert.equal(parsed.subjectDetails, null);
  assert.equal(parsed.ipPolicy, null);
  assert.deepEqual(parsed.permissions, ["one", "two", "three"]);
  assert.deepEqual(parsed.permissionsExcluded, ["single"]);
  assert.deepEqual(parsed.rolesRaw, ["\\uZZZZ"]);
  assert.deepEqual(parsed.permissionsEffective, []);
});

test("PersonTokenService normalizes missing audience claim to empty array", () => {
  const service = new PersonTokenService();
  const token = buildJwt({
    iss: "https://issuer.example",
    aud: null,
  });

  const parsed = service.parse(token);
  assert.deepEqual(parsed.audiences, []);
});
