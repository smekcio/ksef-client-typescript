import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { test } from "node:test";
import { createZip, CryptographyService } from "../../dist/index.js";
import { runCli } from "../../dist/cli/index.js";

const fixturesPath = path.resolve(process.cwd(), "test", "fixtures", "xades-fixtures.json");
const fixtures = JSON.parse(fs.readFileSync(fixturesPath, "utf8"));

function createCaptureIo() {
  const stdout = [];
  const stderr = [];
  return {
    io: {
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line),
    },
    stdout,
    stderr,
  };
}

function certPemToBase64Der(certPem) {
  return certPem.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s+/g, "");
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Server address is not available."));
        return;
      }
      resolve(address);
    });
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

test("CLI uncovered branch pack: profile/auth/upo/send/export/error-normalization", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ksef-cli-uncovered-"));
  const certBase64Der = certPemToBase64Der(fixtures.rsaCertPem);
  const privateKeyPem = fixtures.rsaKeyPem;
  const upoXml = `<?xml version="1.0" encoding="utf-8"?>
<Potwierdzenie>
  <NazwaPodmiotuPrzyjmujacego>KSeF</NazwaPodmiotuPrzyjmujacego>
  <NumerReferencyjnySesji>S1</NumerReferencyjnySesji>
  <Uwierzytelnienie>
    <IdKontekstu>
      <Nip>1111111111</Nip>
    </IdKontekstu>
    <NumerReferencyjnyTokenaKSeF>TOKEN-REF-1</NumerReferencyjnyTokenaKSeF>
  </Uwierzytelnienie>
  <NazwaStrukturyLogicznej>Faktura</NazwaStrukturyLogicznej>
  <KodFormularza>FA (2)</KodFormularza>
  <Dokument>
    <NipSprzedawcy>1111111111</NipSprzedawcy>
    <NumerKSeFDokumentu>KSEF-1</NumerKSeFDokumentu>
    <NumerFaktury>FV/1</NumerFaktury>
    <DataWystawieniaFaktury>2026-03-03</DataWystawieniaFaktury>
    <DataPrzeslaniaDokumentu>2026-03-03T12:00:00Z</DataPrzeslaniaDokumentu>
    <DataNadaniaNumeruKSeF>2026-03-03T12:01:00Z</DataNadaniaNumeruKSeF>
    <SkrotDokumentu>HASH</SkrotDokumentu>
    <TrybWysylki>Online</TrybWysylki>
  </Dokument>
</Potwierdzenie>`;
  let exportPart = Buffer.from("");
  let exportPartHash = "";
  let sendCalls = 0;
  let address;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");

    if (req.method === "POST" && url.pathname === "/v2/auth/token/refresh") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          accessToken: {
            token: "access-token-refreshed",
            validUntil: "2099-01-01T00:00:00Z",
          },
        }),
      );
      return;
    }

    if (req.method === "POST" && url.pathname === "/v2/auth/challenge") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          challenge: "challenge-value",
          timestamp: "2026-03-04T12:00:00+01:00",
          timestampMs: 1741086000000,
          clientIp: "203.0.113.10",
        }),
      );
      return;
    }

    if (req.method === "GET" && url.pathname === "/v2/security/public-key-certificates") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify([
          {
            certificateSerialNumber: "SERIAL-1",
            validFrom: "2026-01-01T00:00:00Z",
            validTo: "2027-01-01T00:00:00Z",
            usage: ["SymmetricKeyEncryption"],
            certificate: certBase64Der,
          },
        ]),
      );
      return;
    }

    if (req.method === "GET" && url.pathname === "/v2/invoices/ksef/KSEF-1") {
      res.writeHead(200, { "Content-Type": "application/xml" });
      res.end("<Invoice><Id>1</Id></Invoice>");
      return;
    }

    if (req.method === "GET" && url.pathname === "/v2/sessions/S1/upo/U1") {
      res.writeHead(200, { "Content-Type": "application/xml" });
      res.end(upoXml);
      return;
    }

    if (req.method === "POST" && url.pathname === "/v2/sessions/online") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ referenceNumber: "ONLINE-1" }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/v2/sessions/online/ONLINE-1/invoices") {
      sendCalls += 1;
      if (sendCalls === 4) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "send failed" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ referenceNumber: "INV-1" }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/v2/sessions/online/ONLINE-1/close") {
      if (sendCalls === 4) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "close failed" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method === "GET" && url.pathname === "/v2/sessions/ONLINE-1") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: { code: 200, description: "Completed" },
          upo: {
            pages: [{ downloadUrl: `http://127.0.0.1:${address.port}/download/session-upo.xml` }],
          },
        }),
      );
      return;
    }

    if (req.method === "GET" && url.pathname === "/download/session-upo.xml") {
      res.writeHead(200, { "Content-Type": "application/xml" });
      res.end(upoXml);
      return;
    }

    if (req.method === "POST" && url.pathname === "/v2/invoices/exports") {
      const raw = await readBody(req);
      const body = JSON.parse(raw || "{}");
      const encryptedSymmetricKey = body?.encryption?.encryptedSymmetricKey;
      const initializationVector = body?.encryption?.initializationVector;
      const cipherKey = crypto.privateDecrypt(
        {
          key: privateKeyPem,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: "sha256",
        },
        Buffer.from(encryptedSymmetricKey, "base64"),
      );
      const cipherIv = Buffer.from(initializationVector, "base64");

      const archive = await createZip([
        {
          fileName: "_metadata.json",
          content: Buffer.from(JSON.stringify({ invoices: [{ ksefNumber: "KSEF-1" }] }), "utf8"),
        },
        {
          fileName: "invoice-1.xml",
          content: Buffer.from('<Invoice id="1" />', "utf8"),
        },
      ]);
      exportPart = CryptographyService.encryptAes256Cbc(archive, cipherKey, cipherIv);
      exportPartHash = CryptographyService.sha256Base64(exportPart);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ referenceNumber: "EXP-1" }));
      return;
    }

    if (req.method === "GET" && url.pathname === "/v2/invoices/exports/EXP-1") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: { code: 200, description: "Completed" },
          package: {
            invoiceCount: 1,
            size: 1,
            isTruncated: false,
            compressionType: "Zip",
            parts: [
              {
                ordinalNumber: 1,
                partName: "part-1.bin",
                method: "GET",
                encryptedPartHash: exportPartHash,
                url: `http://0.0.0.0:${address.port}/download/export-part.bin`,
              },
            ],
          },
        }),
      );
      return;
    }

    if (req.method === "GET" && url.pathname === "/download/export-part.bin") {
      res.writeHead(200, { "Content-Type": "application/octet-stream" });
      res.end(exportPart);
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: `${req.method} ${url.pathname} not mocked` }));
  });

  address = await listen(server);
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const env = {
    KSEF_CLI_HOME: tempDir,
    KSEF_TOKEN_ENV_ONLY: "KSEF-ENV-TOKEN",
  };

  try {
    let capture = createCaptureIo();
    let exitCode = await runCli(["init"], { io: capture.io, env, cwd: tempDir });
    assert.equal(exitCode, 0);

    capture = createCaptureIo();
    exitCode = await runCli(["init", "--profile", "explicit-profile"], {
      io: capture.io,
      env,
      cwd: tempDir,
    });
    assert.equal(exitCode, 0);

    const configPath = path.join(tempDir, "config.json");
    await writeFile(
      configPath,
      JSON.stringify(
        {
          version: 1,
          currentProfile: "default",
          profiles: {
            default: {
              baseUrl,
              tokenStore: { policy: "plaintext" },
              strictPresignedUrlValidation: false,
              allowPrivateNetworkPresignedUrls: true,
            },
            tokenFileOnly: { baseUrl },
            accessEnvOnly: { baseUrl },
            refreshEnvOnly: { baseUrl },
            ksefEnvOnly: { baseUrl },
            allowed: { baseUrl, allowedPresignedHosts: ["example.invalid"] },
            refreshProfile: { baseUrl, tokenStore: { policy: "plaintext" } },
            refreshNoValid: { baseUrl, tokenStore: { policy: "plaintext" } },
            tokenlessAuth: {
              baseUrl,
              tokenStore: { policy: "env", ksefTokenEnvVar: "KSEF_TOKEN_ENV_ONLY" },
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "profile", "show", "default"], {
      io: capture.io,
      env,
      cwd: tempDir,
    });
    assert.equal(exitCode, 0);

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "profile", "show"], { io: capture.io, env, cwd: tempDir });
    assert.equal(exitCode, 0);

    for (const [profile, option, value] of [
      ["tokenFileOnly", "--token-file", "./tokens-a.json"],
      ["accessEnvOnly", "--access-token-env", "ACCESS_FROM_ENV"],
      ["refreshEnvOnly", "--refresh-token-env", "REFRESH_FROM_ENV"],
      ["ksefEnvOnly", "--ksef-token-env", "KSEF_TOKEN_FROM_ENV"],
    ]) {
      capture = createCaptureIo();
      exitCode = await runCli(["--json", "profile", "set", profile, option, value], {
        io: capture.io,
        env,
        cwd: tempDir,
      });
      assert.equal(exitCode, 0);
    }

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "lighthouse"], {
      io: capture.io,
      env,
      cwd: tempDir,
      fetchImpl: async () => {
        throw "lighthouse-string-error";
      },
    });
    assert.equal(exitCode, 5);

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "health", "--profile", "allowed"], {
      io: capture.io,
      env,
      cwd: tempDir,
    });
    assert.equal(exitCode, 0);

    let stderr = [];
    exitCode = await runCli(["profile", "list"], {
      io: {
        stdout: () => {
          throw "stdout-string-error";
        },
        stderr: (line) => stderr.push(line),
      },
      env,
      cwd: tempDir,
    });
    assert.equal(exitCode, 1);
    assert.ok(stderr.some((line) => /stdout-string-error/.test(line)));

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "auth", "login", "--profile", "tokenlessAuth"], {
      io: capture.io,
      env,
      cwd: tempDir,
    });
    assert.equal(exitCode, 3);

    const tokensPath = path.join(tempDir, "tokens.json");
    await writeFile(
      tokensPath,
      JSON.stringify(
        {
          version: 1,
          profiles: {
            refreshProfile: {
              accessToken: "access-before-refresh",
              refreshToken: "refresh-token",
              refreshTokenValidUntil: "2099-01-01T00:00:00.000Z",
              updatedAt: "2026-03-04T00:00:00.000Z",
            },
            refreshNoValid: {
              accessToken: "access-before-refresh-2",
              refreshToken: "refresh-token-2",
              updatedAt: "2026-03-04T00:00:00.000Z",
            },
            default: {
              accessToken: "access-without-valid-until",
              refreshToken: "refresh-default",
              refreshTokenValidUntil: "2099-01-01T00:00:00.000Z",
              updatedAt: "2026-03-04T00:00:00.000Z",
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "auth", "refresh", "--profile", "refreshProfile"], {
      io: capture.io,
      env,
      cwd: tempDir,
    });
    assert.equal(exitCode, 0);

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "auth", "refresh", "--profile", "refreshNoValid"], {
      io: capture.io,
      env,
      cwd: tempDir,
    });
    assert.equal(exitCode, 0);

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "invoice", "get", "KSEF-1", "--profile", "default"], {
      io: capture.io,
      env,
      cwd: tempDir,
    });
    assert.equal(exitCode, 0);

    const upoOutput = path.join(tempDir, "upo-out.xml");
    capture = createCaptureIo();
    exitCode = await runCli(
      [
        "--json",
        "upo",
        "get",
        "S1",
        "--profile",
        "default",
        "--upo-ref",
        "U1",
        "--parse",
        "--output",
        upoOutput,
      ],
      { io: capture.io, env, cwd: tempDir },
    );
    assert.equal(exitCode, 0);
    assert.match(await readFile(upoOutput, "utf8"), /Potwierdzenie/);

    capture = createCaptureIo();
    exitCode = await runCli(
      ["upo", "get", "S1", "--profile", "default", "--upo-ref", "U1", "--parse"],
      { io: capture.io, env, cwd: tempDir },
    );
    assert.equal(exitCode, 0);
    assert.match(capture.stdout[0], /"upo"/);

    const invoiceFile = path.join(tempDir, "invoice.xml");
    await writeFile(invoiceFile, "<Invoice><Id>1</Id></Invoice>", "utf8");

    capture = createCaptureIo();
    exitCode = await runCli(
      [
        "--json",
        "send",
        "--profile",
        "default",
        "--invoice-file",
        invoiceFile,
        "--form-code",
        "FA2",
      ],
      { io: capture.io, env, cwd: tempDir },
    );
    assert.equal(exitCode, 0);

    capture = createCaptureIo();
    exitCode = await runCli(
      [
        "--json",
        "send",
        "--profile",
        "default",
        "--invoice-file",
        invoiceFile,
        "--form-code",
        "FA2",
        "--wait-upo",
        "--max-attempts",
        "1",
      ],
      { io: capture.io, env, cwd: tempDir },
    );
    assert.equal(exitCode, 0);

    capture = createCaptureIo();
    exitCode = await runCli(
      [
        "--json",
        "send",
        "--profile",
        "default",
        "--invoice-file",
        invoiceFile,
        "--form-code",
        "FA2",
        "--wait-upo",
        "--poll-interval-ms",
        "1",
      ],
      { io: capture.io, env, cwd: tempDir },
    );
    assert.equal(exitCode, 0);

    capture = createCaptureIo();
    exitCode = await runCli(
      [
        "--json",
        "send",
        "--profile",
        "default",
        "--invoice-file",
        invoiceFile,
        "--form-code",
        "FA2",
        "--wait-upo",
        "--max-attempts",
        "1",
      ],
      { io: capture.io, env, cwd: tempDir },
    );
    assert.equal(exitCode, 5);

    const filtersPath = path.join(tempDir, "filters.json");
    await writeFile(
      filtersPath,
      JSON.stringify({
        subjectType: "Subject1",
        dateRange: { dateType: "Issue", from: "2025-01-01", to: "2025-01-01" },
      }),
      "utf8",
    );

    capture = createCaptureIo();
    exitCode = await runCli(
      ["--json", "export", "--profile", "default", "--filters-file", filtersPath],
      { io: capture.io, env, cwd: tempDir },
    );
    assert.equal(exitCode, 0, `${capture.stderr.join("\n")}\n${capture.stdout.join("\n")}`);
  } finally {
    await closeServer(server);
    await rm(tempDir, { recursive: true, force: true });
  }
});
