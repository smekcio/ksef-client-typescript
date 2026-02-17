import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeJwtPayload, getJwtExpiryMs } from "../../dist/index.js";

function buildJwt(payload) {
  const header = { alg: "none", typ: "JWT" };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encodedHeader}.${encodedPayload}.signature`;
}

test("decodeJwtPayload parses valid payload", () => {
  const token = buildJwt({ exp: 1700000000, scope: "invoices:read" });
  const payload = decodeJwtPayload(token);
  assert.ok(payload);
  assert.equal(payload.exp, 1700000000);
});

test("decodeJwtPayload returns null for malformed token", () => {
  assert.equal(decodeJwtPayload("not-a-jwt"), null);
  assert.equal(decodeJwtPayload("abc.def"), null);
});

test("getJwtExpiryMs converts exp to milliseconds", () => {
  const token = buildJwt({ exp: 1700000000 });
  assert.equal(getJwtExpiryMs(token), 1700000000000);
});

test("getJwtExpiryMs returns null when exp is missing", () => {
  const token = buildJwt({ aud: "ksef" });
  assert.equal(getJwtExpiryMs(token), null);
});
