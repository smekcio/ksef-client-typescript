import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { test } from "node:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distIndexUrl = pathToFileURL(path.resolve(__dirname, "../../dist/index.js")).href;
const fixturesPath = path.resolve(__dirname, "..", "fixtures", "xades-fixtures.json");

async function runNodeWithLoader({ loaderSource, script, env = {} }) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ksef-xades-loader-"));
  const loaderPath = path.join(tempDir, "loader.mjs");
  const loaderUrl = pathToFileURL(loaderPath).href;
  await writeFile(loaderPath, loaderSource, "utf8");

  try {
    return spawnSync(
      process.execPath,
      ["--experimental-loader", loaderUrl, "--input-type=module", "--eval", script],
      {
        cwd: process.cwd(),
        env: { ...process.env, ...env },
        encoding: "utf8",
      },
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

test("XadesKeyPair.fromPkcs12 reports missing optional node-forge dependency", async () => {
  const run = await runNodeWithLoader({
    loaderSource: `
      export async function resolve(specifier, context, defaultResolve) {
        if (specifier === "node-forge") {
          throw new Error("node-forge-disabled-for-test");
        }
        return defaultResolve(specifier, context, defaultResolve);
      }
    `,
    script: `
      import assert from "node:assert/strict";
      import { XadesKeyPair } from ${JSON.stringify(distIndexUrl)};
      await assert.rejects(
        () => XadesKeyPair.fromPkcs12({ pkcs12Bytes: new Uint8Array([1, 2, 3]) }),
        /requires optional dependency 'node-forge'/,
      );
    `,
  });

  assert.equal(run.status, 0, `stdout:\n${run.stdout}\nstderr:\n${run.stderr}`);
});

test("XadesKeyPair.fromPkcs12 covers key/cert guard and matching branches with mocked node-forge", async () => {
  const loaderSource = `
    export async function resolve(specifier, context, defaultResolve) {
      if (specifier === "node-forge") {
        return { url: "node-forge-mock:module", shortCircuit: true };
      }
      return defaultResolve(specifier, context, defaultResolve);
    }

    export async function load(url, context, defaultLoad) {
      if (url === "node-forge-mock:module") {
        return {
          format: "module",
          shortCircuit: true,
          source: \`
            import fs from "node:fs";
            const fixtures = JSON.parse(fs.readFileSync(process.env.XADES_FIXTURES_PATH, "utf8"));
            const scenario = process.env.XADES_FORGE_SCENARIO;
            const oids = {
              pkcs8ShroudedKeyBag: "pkcs8ShroudedKeyBag",
              keyBag: "keyBag",
              certBag: "certBag",
            };

            function localKeyIdValue(kind) {
              if (kind === "uint8") {
                return [new Uint8Array([1, 2, 3])];
              }
              if (kind === "string") {
                return [String.fromCharCode(1, 2, 3)];
              }
              if (kind === "object") {
                return [{ id: 123 }];
              }
              return undefined;
            }

            function makeBags() {
              if (scenario === "no-key") {
                return {
                  pkcs8ShroudedKeyBag: [],
                  keyBag: [],
                  certBag: [{ cert: { pem: fixtures.rsaCertPem }, attributes: {} }],
                };
              }
              if (scenario === "no-key-undefined") {
                return {
                  pkcs8ShroudedKeyBag: undefined,
                  keyBag: undefined,
                  certBag: [{ cert: { pem: fixtures.rsaCertPem }, attributes: {} }],
                };
              }
              if (scenario === "no-cert") {
                return {
                  pkcs8ShroudedKeyBag: [{ key: { pem: fixtures.rsaKeyPem }, attributes: {} }],
                  keyBag: [],
                  certBag: [],
                };
              }
              if (scenario === "no-cert-undefined") {
                return {
                  pkcs8ShroudedKeyBag: [{ key: { pem: fixtures.rsaKeyPem }, attributes: {} }],
                  keyBag: [],
                  certBag: undefined,
                };
              }
              if (scenario === "fallback-by-spki") {
                return {
                  pkcs8ShroudedKeyBag: [{ key: { pem: fixtures.rsaKeyPem }, attributes: {} }],
                  keyBag: [],
                  certBag: [{ cert: { pem: fixtures.rsaCertPem }, attributes: {} }],
                };
              }
              if (scenario === "mismatch") {
                return {
                  pkcs8ShroudedKeyBag: [
                    { key: { pem: fixtures.rsaKeyPem }, attributes: { localKeyId: localKeyIdValue("string") } },
                  ],
                  keyBag: [],
                  certBag: [
                    { cert: { pem: fixtures.ecCertPem }, attributes: { localKeyId: localKeyIdValue("string") } },
                  ],
                };
              }
              if (scenario === "uint8-local-key-id") {
                return {
                  pkcs8ShroudedKeyBag: [
                    { key: { pem: fixtures.rsaKeyPem }, attributes: { localKeyId: localKeyIdValue("uint8") } },
                  ],
                  keyBag: [],
                  certBag: [
                    { cert: { pem: fixtures.rsaCertPem }, attributes: { localKeyId: localKeyIdValue("uint8") } },
                  ],
                };
              }
              if (scenario === "keybag-fallback") {
                return {
                  pkcs8ShroudedKeyBag: undefined,
                  keyBag: [{ key: { pem: fixtures.rsaKeyPem }, attributes: { localKeyId: localKeyIdValue("string") } }],
                  certBag: [{ cert: { pem: fixtures.rsaCertPem }, attributes: { localKeyId: localKeyIdValue("string") } }],
                };
              }
              if (scenario === "object-local-key-id") {
                return {
                  pkcs8ShroudedKeyBag: [
                    { key: { pem: fixtures.rsaKeyPem }, attributes: { localKeyId: localKeyIdValue("object") } },
                  ],
                  keyBag: [],
                  certBag: [
                    { cert: { pem: fixtures.rsaCertPem }, attributes: { localKeyId: localKeyIdValue("object") } },
                  ],
                };
              }
              if (scenario === "missing-parent-chain") {
                return {
                  pkcs8ShroudedKeyBag: [{ key: { pem: fixtures.rsaKeyPem }, attributes: {} }],
                  keyBag: [],
                  certBag: [{ cert: { pem: fixtures.rsaCertPem }, attributes: {} }],
                };
              }
              return {
                pkcs8ShroudedKeyBag: [{ key: { pem: fixtures.rsaKeyPem }, attributes: {} }],
                keyBag: [],
                certBag: [{ cert: { pem: fixtures.rsaCertPem }, attributes: {} }],
              };
            }

            const bags = makeBags();
            const forge = {
              asn1: { fromDer: () => ({}) },
              pkcs12: {
                pkcs12FromAsn1: () => ({
                  getBags: ({ bagType }) => ({ [bagType]: bags[bagType] }),
                }),
              },
              pki: {
                oids,
                privateKeyToPem: (key) => key.pem,
                certificateToPem: (cert) => cert.pem,
              },
            };

            export const asn1 = forge.asn1;
            export const pkcs12 = forge.pkcs12;
            export const pki = forge.pki;
            export default scenario === "no-default-export" ? undefined : forge;
          \`,
        };
      }
      return defaultLoad(url, context, defaultLoad);
    }
  `;

  const script = `
    import assert from "node:assert/strict";
    import crypto from "node:crypto";
    import { XadesKeyPair } from ${JSON.stringify(distIndexUrl)};

    const scenario = process.env.XADES_FORGE_SCENARIO;
    if (scenario === "missing-parent-chain") {
      const OriginalX509 = crypto.X509Certificate;
      class FakeX509Certificate {
        constructor(pem) {
          this._inner = new OriginalX509(pem);
          this.publicKey = this._inner.publicKey;
          this.raw = this._inner.raw;
          this.serialNumber = this._inner.serialNumber;
          this.subject = "CN=LeafSubject";
          this.issuer = "CN=MissingIssuer";
        }

        toString() {
          return this._inner.toString();
        }
      }
      crypto.X509Certificate = FakeX509Certificate;
    }

    const options = {
      pkcs12Bytes: new Uint8Array([1, 2, 3]),
      pkcs12Password: "x",
    };

    if (scenario === "no-key" || scenario === "no-key-undefined") {
      await assert.rejects(() => XadesKeyPair.fromPkcs12(options), /does not contain a private key/);
      process.exit(0);
    }
    if (scenario === "no-cert" || scenario === "no-cert-undefined") {
      await assert.rejects(() => XadesKeyPair.fromPkcs12(options), /does not contain a certificate/);
      process.exit(0);
    }
    if (scenario === "mismatch") {
      await assert.rejects(
        () => XadesKeyPair.fromPkcs12(options),
        /does not contain a matching private key and certificate/,
      );
      process.exit(0);
    }

    const pair = await XadesKeyPair.fromPkcs12(options);
    assert.match(pair.certificatePem, /BEGIN CERTIFICATE/);
    assert.equal(pair.privateKey.type, "private");
    if (scenario === "missing-parent-chain") {
      assert.deepEqual(pair.certificateChainPem, []);
    }
    process.exit(0);
  `;

  for (const scenario of [
    "no-key",
    "no-key-undefined",
    "no-cert",
    "no-cert-undefined",
    "fallback-by-spki",
    "mismatch",
    "uint8-local-key-id",
    "object-local-key-id",
    "keybag-fallback",
    "no-default-export",
    "missing-parent-chain",
  ]) {
    const run = await runNodeWithLoader({
      loaderSource,
      script,
      env: {
        XADES_FIXTURES_PATH: fixturesPath,
        XADES_FORGE_SCENARIO: scenario,
      },
    });
    assert.equal(
      run.status,
      0,
      `scenario=${scenario}\nstdout:\n${run.stdout}\nstderr:\n${run.stderr}`,
    );
  }
});
