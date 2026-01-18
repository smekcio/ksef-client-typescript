import assert from "node:assert/strict";
import { test } from "node:test";
import { fromBase64Url, toBase64Url } from "../../dist/index.js";

test("base64url roundtrip", () => {
  const input = Buffer.from("hello-world", "utf8");
  const encoded = toBase64Url(input);
  const decoded = fromBase64Url(encoded);
  assert.equal(decoded.toString("utf8"), "hello-world");
});
