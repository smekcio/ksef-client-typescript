import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAuthTokenRequestXml, normalizeContextIdentifierType } from "../../dist/index.js";

test("normalizeContextIdentifierType maps supported aliases", () => {
  assert.equal(normalizeContextIdentifierType("nip"), "Nip");
  assert.equal(normalizeContextIdentifierType(" InternalId "), "InternalId");
  assert.equal(normalizeContextIdentifierType("NIPVATUE"), "NipVatUe");
  assert.equal(normalizeContextIdentifierType("peppolId"), "PeppolId");
});

test("normalizeContextIdentifierType throws for unsupported value", () => {
  assert.throws(() => normalizeContextIdentifierType("unknown-type"), /Unsupported context identifier type/);
});

test("buildAuthTokenRequestXml uses default subjectIdentifierType and optional policy", () => {
  const xml = buildAuthTokenRequestXml({
    challenge: "abc123",
    contextIdentifierType: "nip",
    contextIdentifierValue: "1111111111",
    authorizationPolicyXml: "<AuthorizationPolicy><AllowedIps/></AuthorizationPolicy>",
  });

  assert.match(xml, /<Challenge>abc123<\/Challenge>/);
  assert.match(xml, /<Nip>1111111111<\/Nip>/);
  assert.match(xml, /<SubjectIdentifierType>certificateSubject<\/SubjectIdentifierType>/);
  assert.match(xml, /<AuthorizationPolicy><AllowedIps\/><\/AuthorizationPolicy>/);
});

test("buildAuthTokenRequestXml supports explicit subjectIdentifierType", () => {
  const xml = buildAuthTokenRequestXml({
    challenge: "abc123",
    contextIdentifierType: "peppolid",
    contextIdentifierValue: "0088:123456789",
    subjectIdentifierType: "fingerprint",
  });

  assert.match(xml, /<PeppolId>0088:123456789<\/PeppolId>/);
  assert.match(xml, /<SubjectIdentifierType>fingerprint<\/SubjectIdentifierType>/);
});
