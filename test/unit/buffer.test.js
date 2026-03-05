import assert from "node:assert/strict";
import { test } from "node:test";
import { splitBuffer } from "../../dist/index.js";

test("splitBuffer throws when maxPartSize is non-positive", () => {
  assert.throws(
    () => splitBuffer(Buffer.from("abc", "utf8"), 0),
    /maxPartSize must be positive\./,
  );
});

test("splitBuffer splits buffer into ordered parts", () => {
  const input = Buffer.from("abcdefghij", "utf8");
  const parts = splitBuffer(input, 4);

  assert.equal(parts.length, 3);
  assert.deepEqual(
    parts.map((part) => part.toString("utf8")),
    ["abcd", "efgh", "ij"],
  );
  assert.equal(Buffer.concat(parts).toString("utf8"), "abcdefghij");
});
