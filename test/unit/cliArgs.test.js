import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getBooleanOption,
  getNumberOption,
  getStringOption,
  parseArgv,
} from "../../src/cli/args.ts";

test("parseArgv handles sparse argv, -- separator and --key=value syntax", () => {
  const sparse = [];
  sparse.length = 1;
  const sparseParsed = parseArgv(sparse);
  assert.deepEqual(sparseParsed.positionals, []);
  assert.deepEqual(sparseParsed.options, {});

  const parsed = parseArgv([
    "--profile=dev",
    "--page-size",
    "25",
    "--",
    "invoice",
    "query",
  ]);
  assert.equal(parsed.options.profile, "dev");
  assert.equal(parsed.options["page-size"], "25");
  assert.deepEqual(parsed.positionals, ["invoice", "query"]);
});

test("option accessors cover boolean and number conversion branches", () => {
  const options = {
    flagTrue: true,
    flagFalseString: "false",
    flagZeroString: "0",
    flagText: "yes",
    numeric: "123",
    notNumeric: "abc",
    plain: "text",
  };

  assert.equal(getBooleanOption(options, "flagTrue"), true);
  assert.equal(getBooleanOption(options, "flagFalseString"), false);
  assert.equal(getBooleanOption(options, "flagZeroString"), false);
  assert.equal(getBooleanOption(options, "flagText"), true);
  assert.equal(getBooleanOption(options, "missing"), false);

  assert.equal(getStringOption(options, "plain"), "text");
  assert.equal(getStringOption(options, "flagTrue"), undefined);

  assert.equal(getNumberOption(options, "numeric"), 123);
  assert.equal(getNumberOption(options, "notNumeric"), undefined);
  assert.equal(getNumberOption(options, "missing"), undefined);
});
