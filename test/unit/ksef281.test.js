import assert from "node:assert/strict";
import fs from "node:fs";
import { createServer } from "node:http";
import { test } from "node:test";
import {
  KsefClient,
  KsefApiError,
  OpenApiModels,
  RATE_LIMIT_GROUPS,
  getRateLimit,
  listRateLimits,
} from "../../dist/index.js";

const spec = JSON.parse(
  fs.readFileSync(new URL("../../specs/ksef-openapi.snapshot.json", import.meta.url), "utf8"),
);

test("snapshot and generated models target KSeF 2.8.1", () => {
  assert.match(spec.info.description, /Wersja API:\*\* 2\.8\.1\b/);
  assert.equal(OpenApiModels.KSEF_API_VERSION, "2.8.1");
  assert.deepEqual(
    [...RATE_LIMIT_GROUPS].sort(),
    Object.keys(spec.components.schemas.EffectiveApiRateLimits.properties).sort(),
  );
  for (const name of [
    "EntityPermissionType",
    "EntityPermissionItemScope",
    "IndirectPermissionType",
  ]) {
    assert.ok(spec.components.schemas[name].enum.includes("CollectiveIdentifierManage"));
  }
  for (const code of ["CNH", "VED", "XTS", "ZWG", "SLE"]) {
    assert.ok(spec.components.schemas.CurrencyCode.enum.includes(code));
  }
});

test("rate limit helpers distinguish unlimited windows and separate session closing groups", () => {
  const limits = {
    anonymous: { perSecond: 60, perMinute: -1, perHour: -1 },
    global: { perSecond: -1, perMinute: -1, perHour: -1 },
    onlineSessionClose: { perSecond: 10, perMinute: 20, perHour: 30 },
    batchSessionClose: { perSecond: 1, perMinute: 2, perHour: 3 },
  };
  assert.equal(getRateLimit(limits, "anonymous").isUnlimited, false);
  assert.equal(getRateLimit(limits, "global").isUnlimited, true);
  assert.equal(getRateLimit(limits, "onlineSessionClose").perSecond, 10);
  assert.equal(getRateLimit(limits, "batchSessionClose").perSecond, 1);
  assert.equal(getRateLimit(limits, "unknown"), undefined);
  assert.equal(getRateLimit(limits, "toString"), undefined);
  assert.equal(listRateLimits(limits).length, 4);
});

for (const timestamp of [undefined, null, "2026-10-08T10:00:00Z", 123]) {
  test(`403 Problem Details handles timestamp ${timestamp}`, async () => {
    const payload = {
      title: "Forbidden",
      status: 403,
      detail: "Permission required",
      reasonCode: "missing-permissions",
      security: { requiredAnyOfPermissions: ["CollectiveIdentifierManage"] },
      ...(timestamp !== undefined ? { timestamp } : {}),
    };
    const server = createServer((req, res) => {
      res.writeHead(403, { "Content-Type": "application/problem+json" });
      res.end(JSON.stringify(payload));
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const client = new KsefClient({
      baseUrl: `http://127.0.0.1:${server.address().port}`,
      proxy: "",
      retryOn5xx: false,
    });
    try {
      await assert.rejects(client.http.request({ method: "GET", path: "/test" }), (error) => {
        assert.ok(error instanceof KsefApiError);
        if (typeof timestamp === "number" || timestamp === null)
          assert.deepEqual(error.problem.raw, payload);
        else {
          assert.equal(error.problem.reasonCode, "missing-permissions");
          assert.deepEqual(error.problem.security, payload.security);
          assert.equal(error.problem.timestamp, timestamp);
          assert.equal(error.problem.raw, undefined);
        }
        return true;
      });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
}
