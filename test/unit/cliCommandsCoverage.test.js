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

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
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

test("CLI flow covers profile/auth/health/invoice/send/upo/export commands", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ksef-cli-flow-"));
  const certBase64Der = certPemToBase64Der(fixtures.rsaCertPem);
  const privateKeyPem = fixtures.rsaKeyPem;

  let exportPart = Buffer.from("");
  let exportPartHash = "";
  let address;

  const upoXml = `<?xml version="1.0" encoding="utf-8"?>
<Potwierdzenie>
  <NazwaPodmiotuPrzyjmujacego>KSeF</NazwaPodmiotuPrzyjmujacego>
  <NumerReferencyjnySesji>ONLINE-REF-1</NumerReferencyjnySesji>
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
    <NumerKSeFDokumentu>KSEF-INV-1</NumerKSeFDokumentu>
    <NumerFaktury>FV/1</NumerFaktury>
    <DataWystawieniaFaktury>2026-03-03</DataWystawieniaFaktury>
    <DataPrzeslaniaDokumentu>2026-03-03T12:00:00Z</DataPrzeslaniaDokumentu>
    <DataNadaniaNumeruKSeF>2026-03-03T12:01:00Z</DataNadaniaNumeruKSeF>
    <SkrotDokumentu>HASH</SkrotDokumentu>
    <TrybWysylki>Online</TrybWysylki>
  </Dokument>
</Potwierdzenie>`;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");

    if (req.method === "POST" && url.pathname === "/v2/auth/challenge") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          challenge: "challenge-value",
          timestamp: "2026-03-03T12:00:00+01:00",
          timestampMs: 1741009200000,
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
            usage: ["KsefTokenEncryption", "SymmetricKeyEncryption"],
            certificate: certBase64Der,
          },
        ]),
      );
      return;
    }

    if (req.method === "POST" && url.pathname === "/v2/auth/ksef-token") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          authenticationToken: {
            token: "auth-token-1",
            validUntil: "2026-03-03T13:00:00Z",
          },
          referenceNumber: "AUTH-REF-1",
        }),
      );
      return;
    }

    if (req.method === "GET" && url.pathname === "/v2/auth/AUTH-REF-1") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          startDate: "2026-03-03T12:00:00Z",
          authenticationMethod: "Token",
          status: { code: 200, description: "Completed" },
        }),
      );
      return;
    }

    if (req.method === "POST" && url.pathname === "/v2/auth/token/redeem") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          accessToken: {
            token: "access-token-1",
            validUntil: "2026-03-03T14:00:00Z",
          },
          refreshToken: {
            token: "refresh-token-1",
            validUntil: "2026-03-10T14:00:00Z",
          },
        }),
      );
      return;
    }

    if (req.method === "POST" && url.pathname === "/v2/auth/token/refresh") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          accessToken: {
            token: "access-token-2",
            validUntil: "2026-03-03T15:00:00Z",
          },
        }),
      );
      return;
    }

    if (req.method === "GET" && url.pathname === "/v2/auth/sessions") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          items: [
            {
              startDate: "2026-03-03T12:00:00Z",
              referenceNumber: "SESSION-1",
              authenticationMethod: "Token",
              authenticationMethodInfo: {
                category: "Token",
                code: "Token",
                displayName: "Token KSeF",
              },
              status: { code: 200, description: "ok" },
            },
          ],
        }),
      );
      return;
    }

    if (req.method === "GET" && url.pathname === "/v2/rate-limits") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ limits: { perSecond: 10 } }));
      return;
    }

    if (
      req.method === "GET" &&
      (url.pathname.startsWith("/v2/invoices/") || url.pathname.startsWith("/v2/invoices/ksef/"))
    ) {
      const segments = url.pathname.split("/");
      if (segments.length === 4 || (segments.length === 5 && segments[3] === "ksef")) {
        res.writeHead(200, { "Content-Type": "application/xml" });
        res.end("<Invoice><Number>FV/1</Number></Invoice>");
        return;
      }
    }

    if (req.method === "POST" && url.pathname === "/v2/invoices/query/metadata") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ items: [{ ksefNumber: "KSEF-1" }] }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/v2/sessions/online") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ referenceNumber: "ONLINE-REF-1" }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/v2/sessions/online/ONLINE-REF-1/invoices") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ referenceNumber: "INV-REF-1" }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/v2/sessions/online/ONLINE-REF-1/close") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method === "GET" && url.pathname === "/v2/sessions/ONLINE-REF-1") {
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

    if (req.method === "GET" && url.pathname === "/v2/sessions/ONLINE-REF-1/invoices/INV-REF-1/upo") {
      res.writeHead(200, { "Content-Type": "application/xml" });
      res.end(upoXml);
      return;
    }

    if (
      req.method === "GET" &&
      url.pathname === "/v2/sessions/ONLINE-REF-1/invoices/ksef/KSEF-INV-1/upo"
    ) {
      res.writeHead(200, { "Content-Type": "application/xml" });
      res.end(upoXml);
      return;
    }

    if (req.method === "GET" && url.pathname === "/v2/sessions/ONLINE-REF-1/upo/UPO-REF-1") {
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
          content: Buffer.from("<Invoice id=\"1\" />", "utf8"),
        },
      ]);
      exportPart = CryptographyService.encryptAes256Cbc(archive, cipherKey, cipherIv);
      exportPartHash = CryptographyService.sha256Base64(exportPart);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ referenceNumber: "EXP-REF-1" }));
      return;
    }

    if (req.method === "GET" && url.pathname === "/v2/invoices/exports/EXP-REF-1") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: { code: 200, description: "Completed" },
          package: {
            invoiceCount: 1,
            size: exportPart.length,
            isTruncated: false,
            parts: [
              {
                ordinalNumber: 1,
                partName: "part-1.bin",
                method: "GET",
                url: `http://0.0.0.0:${address.port}/download/export-part.bin`,
                partSize: exportPart.length,
                partHash: "unused",
                encryptedPartSize: exportPart.length,
                encryptedPartHash: exportPartHash,
                expirationDate: "2099-01-01T00:00:00Z",
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

  try {
    const env = {
      KSEF_CLI_HOME: tempDir,
    };

    let capture = createCaptureIo();
    let exitCode = await runCli(
      [
        "init",
        "--profile",
        "default",
        "--base-url",
        baseUrl,
        "--context-type",
        "Nip",
        "--context-value",
        "1111111111",
        "--token-store-policy",
        "plaintext",
      ],
      { io: capture.io, env, cwd: tempDir },
    );
    assert.equal(exitCode, 0, `${capture.stderr.join("\n")}\n${capture.stdout.join("\n")}`);

    const configPath = path.join(tempDir, "config.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    config.profiles.default.strictPresignedUrlValidation = false;
    config.profiles.default.allowPrivateNetworkPresignedUrls = true;
    await writeFile(configPath, JSON.stringify(config, null, 2), "utf8");

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "profile", "set", "ops", "--env", "DEMO", "--lighthouse-env", "PROD"], {
      io: capture.io,
      env,
      cwd: tempDir,
    });
    assert.equal(exitCode, 0, `${capture.stderr.join("\n")}\n${capture.stdout.join("\n")}`);

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "profile", "list"], { io: capture.io, env, cwd: tempDir });
    assert.equal(exitCode, 0, `${capture.stderr.join("\n")}\n${capture.stdout.join("\n")}`);
    assert.match(capture.stdout[0], /default/);
    assert.match(capture.stdout[0], /ops/);

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "profile", "use", "default"], { io: capture.io, env, cwd: tempDir });
    assert.equal(exitCode, 0);

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "auth", "login", "--token", "KSEF-TOKEN-1", "--profile", "default"], {
      io: capture.io,
      env,
      cwd: tempDir,
    });
    assert.equal(exitCode, 0);
    assert.match(capture.stdout[0], /"stored": true/);

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "auth", "status", "--profile", "default", "--page-size", "5"], {
      io: capture.io,
      env,
      cwd: tempDir,
    });
    assert.equal(exitCode, 0);
    assert.match(capture.stdout[0], /activeSessions/);

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "auth", "refresh", "--profile", "default"], {
      io: capture.io,
      env,
      cwd: tempDir,
    });
    assert.equal(exitCode, 0);
    assert.match(capture.stdout[0], /accessTokenValidUntil/);

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "health", "--with-auth", "--profile", "default"], {
      io: capture.io,
      env,
      cwd: tempDir,
    });
    assert.equal(exitCode, 0);
    assert.match(capture.stdout[0], /challengeLatencyMs/);
    assert.match(capture.stdout[0], /rateLimits/);

    const invoiceFile = path.join(tempDir, "invoice.xml");
    await writeFile(invoiceFile, "<Invoice><Id>1</Id></Invoice>", "utf8");
    const filtersFile = path.join(tempDir, "filters.json");
    await writeFile(
      filtersFile,
      JSON.stringify(
        {
          subjectType: "Subject1",
          dateRange: {
            dateType: "Issue",
            from: "2025-01-01",
            to: "2025-01-02",
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    capture = createCaptureIo();
    exitCode = await runCli(
      [
        "--json",
        "invoice",
        "query",
        "--profile",
        "default",
        "--filters-file",
        filtersFile,
        "--sort-order",
        "Desc",
        "--page-offset",
        "1",
        "--page-size",
        "2",
      ],
      {
        io: capture.io,
        env,
        cwd: tempDir,
      },
    );
    assert.equal(exitCode, 0);
    assert.match(capture.stdout[0], /metadata/);

    capture = createCaptureIo();
    exitCode = await runCli(
      [
        "--json",
        "invoice",
        "query",
        "--profile",
        "default",
        "--filters-file",
        filtersFile,
        "--sort-order",
        "bad",
      ],
      {
        io: capture.io,
        env,
        cwd: tempDir,
      },
    );
    assert.equal(exitCode, 2);

    const invoiceOut = path.join(tempDir, "downloaded-invoice.xml");
    capture = createCaptureIo();
    exitCode = await runCli(
      ["--json", "invoice", "get", "KSEF-INV-1", "--profile", "default", "--output", invoiceOut],
      {
        io: capture.io,
        env,
        cwd: tempDir,
      },
    );
    assert.equal(exitCode, 0, `${capture.stderr.join("\n")}\n${capture.stdout.join("\n")}`);

    capture = createCaptureIo();
    exitCode = await runCli(
      ["--json", "upo", "bad-subcommand", "ONLINE-REF-1", "--profile", "default"],
      {
        io: capture.io,
        env,
        cwd: tempDir,
      },
    );
    assert.equal(exitCode, 2);
    assert.match(await readFile(invoiceOut, "utf8"), /<Invoice>/);

    capture = createCaptureIo();
    exitCode = await runCli(["invoice", "get", "KSEF-INV-1", "--profile", "default"], {
      io: capture.io,
      env,
      cwd: tempDir,
    });
    assert.equal(exitCode, 0);
    assert.match(capture.stdout[0], /<Invoice>/);

    const upoOut = path.join(tempDir, "upo.xml");
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
        "--max-attempts",
        "1",
        "--upo-output",
        upoOut,
        "--hash-of-corrected-invoice",
        "HASH-1",
      ],
      {
        io: capture.io,
        env,
        cwd: tempDir,
      },
    );
    assert.equal(exitCode, 0, `${capture.stderr.join("\n")}\n${capture.stdout.join("\n")}`);
    assert.match(capture.stdout[0], /ONLINE-REF-1/);
    assert.match(await readFile(upoOut, "utf8"), /<Potwierdzenie>/);

    capture = createCaptureIo();
    exitCode = await runCli(
      [
        "--json",
        "upo",
        "get",
        "ONLINE-REF-1",
        "--profile",
        "default",
        "--invoice-ref",
        "INV-REF-1",
        "--parse",
      ],
      {
        io: capture.io,
        env,
        cwd: tempDir,
      },
    );
    assert.equal(exitCode, 0);
    assert.match(capture.stdout[0], /upo/);

    capture = createCaptureIo();
    exitCode = await runCli(
      [
        "--json",
        "upo",
        "get",
        "ONLINE-REF-1",
        "--profile",
        "default",
        "--ksef-number",
        "KSEF-INV-1",
      ],
      {
        io: capture.io,
        env,
        cwd: tempDir,
      },
    );
    assert.equal(exitCode, 0);

    capture = createCaptureIo();
    exitCode = await runCli(
      [
        "--json",
        "upo",
        "get",
        "ONLINE-REF-1",
        "--profile",
        "default",
        "--upo-ref",
        "UPO-REF-1",
      ],
      {
        io: capture.io,
        env,
        cwd: tempDir,
      },
    );
    assert.equal(exitCode, 0);

    capture = createCaptureIo();
    exitCode = await runCli(
      ["--json", "export", "--profile", "default", "--filters-file", filtersFile, "--no-wait"],
      {
        io: capture.io,
        env,
        cwd: tempDir,
      },
    );
    assert.equal(exitCode, 0);
    assert.match(capture.stdout[0], /"state": "started"/);

    capture = createCaptureIo();
    exitCode = await runCli(
      [
        "--json",
        "export",
        "--profile",
        "default",
        "--filters-file",
        filtersFile,
        "--poll-interval-ms",
        "1",
        "--max-attempts",
        "1",
        "--no-download",
      ],
      {
        io: capture.io,
        env,
        cwd: tempDir,
      },
    );
    assert.equal(exitCode, 0);
    assert.match(capture.stdout[0], /"state": "completed"/);

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "export", "--profile", "default"], {
      io: capture.io,
      env,
      cwd: tempDir,
    });
    assert.equal(exitCode, 2);

    const outDir = path.join(tempDir, "export-out");
    capture = createCaptureIo();
    exitCode = await runCli(
      [
        "--json",
        "export",
        "--profile",
        "default",
        "--filters-file",
        filtersFile,
        "--poll-interval-ms",
        "1",
        "--max-attempts",
        "1",
        "--out-dir",
        outDir,
        "--verify-hashes",
      ],
      {
        io: capture.io,
        env,
        cwd: tempDir,
      },
    );
    assert.equal(exitCode, 0, `${capture.stderr.join("\n")}\n${capture.stdout.join("\n")}`);
    assert.match(await readFile(path.join(outDir, "_metadata.json"), "utf8"), /KSEF-1/);
    assert.match(await readFile(path.join(outDir, "invoice-1.xml"), "utf8"), /Invoice/);

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "auth", "logout", "--profile", "default"], {
      io: capture.io,
      env,
      cwd: tempDir,
    });
    assert.equal(exitCode, 0);
    assert.match(capture.stdout[0], /"cleared": true/);

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "auth", "weird-subcommand", "--profile", "default"], {
      io: capture.io,
      env,
      cwd: tempDir,
    });
    assert.equal(exitCode, 2);
  } finally {
    await closeServer(server);
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("CLI returns usage/config errors for unsupported variants", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ksef-cli-errors-"));
  try {
    const env = { KSEF_CLI_HOME: tempDir };

    let capture = createCaptureIo();
    let exitCode = await runCli(["--json", "profile", "weird-subcommand"], {
      io: capture.io,
      env,
      cwd: tempDir,
    });
    assert.equal(exitCode, 2);

    capture = createCaptureIo();
    exitCode = await runCli(["--json", "auth"], {
      io: capture.io,
      env,
      cwd: tempDir,
    });
    assert.equal(exitCode, 2);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
