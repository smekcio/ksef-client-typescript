import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distCliPath = path.resolve(__dirname, "../../dist/cli/index.js");
const distCliMapPath = path.resolve(__dirname, "../../dist/cli/index.js.map");
const distRootPath = path.resolve(__dirname, "../../dist");

async function loadSessionStoreModule() {
  const tempBaseDir = path.resolve(__dirname, "../../.tmp");
  await mkdir(tempBaseDir, { recursive: true });
  const tempDir = await mkdtemp(path.join(tempBaseDir, "ksef-session-store-"));
  const tempModulePath = path.join(tempDir, "index.js");
  const tempMapPath = path.join(tempDir, "index.js.map");

  try {
    const distEntries = await readdir(distRootPath, { withFileTypes: true });
    for (const entry of distEntries) {
      if (!entry.isFile()) {
        continue;
      }
      if (!entry.name.endsWith(".js")) {
        continue;
      }
      if (!entry.name.startsWith("chunk-") && !entry.name.startsWith("libxmljs2-")) {
        continue;
      }
      await copyFile(path.join(distRootPath, entry.name), path.join(tempBaseDir, entry.name));
    }

    const source = await readFile(distCliPath, "utf8");
    const withoutSourceMapComment = source.replace(
      /\n\/\/# sourceMappingURL=index\.js\.map\s*$/u,
      "",
    );
    const patched = `${withoutSourceMapComment}
export {
  validateSessionId,
  summarizeCheckpoint,
  serializeOnlineSessionState,
  deserializeOnlineSessionState,
  serializeBatchSessionState,
  deserializeBatchSessionState,
  saveCheckpoint,
  loadCheckpoint,
  listCheckpoints,
  deleteCheckpoint,
  updateCheckpoint,
  exportCheckpoint,
  importCheckpoint,
  SessionStoreError,
};
//# sourceMappingURL=index.js.map
`;

    await writeFile(tempModulePath, patched, "utf8");
    await copyFile(distCliMapPath, tempMapPath);

    const moduleUrl = `${pathToFileURL(tempModulePath).href}?cacheBust=${Date.now()}`;
    const loaded = await import(moduleUrl);

    return {
      module: loaded,
      dispose: async () => {
        await rm(tempDir, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}

function onlineCheckpoint(overrides = {}) {
  return {
    schemaVersion: 1,
    id: "sess-online",
    profile: "default",
    baseUrl: "https://api-test.ksef.mf.gov.pl/v2",
    kind: "online",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    stage: "opened",
    sessionState: {
      referenceNumber: "ONLINE-REF",
      encryptionData: {
        cipherKeyBase64: Buffer.alloc(32, 1).toString("base64"),
        cipherIvBase64: Buffer.alloc(16, 2).toString("base64"),
        encryptionInfo: { encryptedSymmetricKey: "k", initializationVector: "i" },
      },
    },
    lastInvoiceRef: null,
    sentInvoiceRefs: [],
    ...overrides,
  };
}

function batchCheckpoint(overrides = {}) {
  return {
    schemaVersion: 1,
    id: "sess-batch",
    profile: "default",
    baseUrl: "https://api-test.ksef.mf.gov.pl/v2",
    kind: "batch",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    stage: "opened",
    sessionState: {
      referenceNumber: "BATCH-REF",
      encryptionData: {
        cipherKeyBase64: Buffer.alloc(32, 3).toString("base64"),
        cipherIvBase64: Buffer.alloc(16, 4).toString("base64"),
        encryptionInfo: { encryptedSymmetricKey: "k", initializationVector: "i" },
      },
      batchFile: {
        fileSize: 10,
        fileHash: "file-hash",
        fileParts: [{ ordinalNumber: 1, fileSize: 10, fileHash: "part-hash" }],
      },
      partUploadRequests: [
        { ordinalNumber: 1, method: "PUT", url: "https://upload/1", headers: { a: "b" } },
      ],
      encryptedPartsBase64: ["QUJD"],
    },
    payloadSource: {
      kind: "zip",
      path: "batch.zip",
      sourceSha256Base64: "source-hash",
      sourceSize: 10,
    },
    uploadedOrdinals: [1],
    lastUpoRef: null,
    ...overrides,
  };
}

async function writeRawCheckpoint(cliHome, profile, id, content) {
  const directory = path.join(cliHome, "cache", "sessions", profile);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, `${id}.json`), content, "utf8");
}

test("sessionStore: validateSessionId normalizes valid ids and throws SessionStoreError", async () => {
  const loaded = await loadSessionStoreModule();
  try {
    const { validateSessionId, SessionStoreError } = loaded.module;
    assert.equal(validateSessionId("  ok.1-2_3  "), "ok.1-2_3");
    assert.throws(
      () => validateSessionId("bad id!"),
      (error) => {
        assert.ok(error instanceof SessionStoreError);
        assert.equal(error.kind, "validation");
        assert.equal(error.name, "SessionStoreError");
        return true;
      },
    );
  } finally {
    await loaded.dispose();
  }
});

test("sessionStore: summarizeCheckpoint covers online and batch branches", async () => {
  const loaded = await loadSessionStoreModule();
  try {
    const { summarizeCheckpoint } = loaded.module;

    const onlineEmpty = summarizeCheckpoint(
      onlineCheckpoint({ lastInvoiceRef: null, sentInvoiceRefs: ["a", "b"] }),
    );
    assert.equal(onlineEmpty.lastInvoiceRef, "");
    assert.equal(onlineEmpty.sentInvoiceCount, 2);

    const onlineFilled = summarizeCheckpoint(onlineCheckpoint({ lastInvoiceRef: "INV-9" }));
    assert.equal(onlineFilled.lastInvoiceRef, "INV-9");

    const batchEmpty = summarizeCheckpoint(
      batchCheckpoint({ lastUpoRef: null, uploadedOrdinals: [1, 2] }),
    );
    assert.equal(batchEmpty.lastUpoRef, "");
    assert.deepEqual(batchEmpty.uploadedOrdinals, [1, 2]);
    assert.equal(batchEmpty.payloadSource.kind, "zip");

    const batchFilled = summarizeCheckpoint(batchCheckpoint({ lastUpoRef: "UPO-3" }));
    assert.equal(batchFilled.lastUpoRef, "UPO-3");
  } finally {
    await loaded.dispose();
  }
});

test("sessionStore: online serialize/deserialize roundtrip with and without upoV43", async () => {
  const loaded = await loadSessionStoreModule();
  try {
    const { serializeOnlineSessionState, deserializeOnlineSessionState } = loaded.module;

    const state = {
      referenceNumber: "R",
      encryptionData: {
        cipherKey: Buffer.alloc(32, 7),
        cipherIv: Buffer.alloc(16, 8),
        encryptionInfo: { encryptedSymmetricKey: "k", initializationVector: "i" },
      },
      upoV43: true,
    };
    const serialized = serializeOnlineSessionState(state);
    assert.equal(serialized.upoV43, true);
    const restored = deserializeOnlineSessionState(serialized);
    assert.ok(restored.encryptionData.cipherKey.equals(Buffer.alloc(32, 7)));
    assert.ok(restored.encryptionData.cipherIv.equals(Buffer.alloc(16, 8)));
    assert.equal(restored.upoV43, true);

    const stateNoFlag = {
      referenceNumber: "R2",
      encryptionData: state.encryptionData,
    };
    const serializedNoFlag = serializeOnlineSessionState(stateNoFlag);
    assert.equal(serializedNoFlag.upoV43, undefined);
    const restoredNoFlag = deserializeOnlineSessionState(serializedNoFlag);
    assert.equal(restoredNoFlag.upoV43, undefined);
  } finally {
    await loaded.dispose();
  }
});

test("sessionStore: batch serialize/deserialize roundtrip with header defaults and flags", async () => {
  const loaded = await loadSessionStoreModule();
  try {
    const { serializeBatchSessionState, deserializeBatchSessionState } = loaded.module;

    const state = {
      referenceNumber: "BR",
      encryptionData: {
        cipherKey: Buffer.alloc(32, 3),
        cipherIv: Buffer.alloc(16, 4),
        encryptionInfo: { encryptedSymmetricKey: "k", initializationVector: "i" },
      },
      batchFile: {
        fileSize: 5,
        fileHash: "h",
        fileParts: [{ ordinalNumber: 1, fileSize: 5, fileHash: "ph" }],
      },
      partUploadRequests: [
        { ordinalNumber: 1, method: "PUT", url: "u1", headers: { a: "1" } },
        { ordinalNumber: 2, method: "PUT", url: "u2" },
      ],
      encryptedPartsBase64: ["QUFB", "QkJC"],
      upoV43: true,
      offlineMode: true,
    };
    const serialized = serializeBatchSessionState(state);
    assert.deepEqual(serialized.partUploadRequests[1].headers, {});
    assert.equal(serialized.upoV43, true);
    assert.equal(serialized.offlineMode, true);
    const restored = deserializeBatchSessionState(serialized);
    assert.ok(restored.encryptionData.cipherKey.equals(Buffer.alloc(32, 3)));
    assert.equal(restored.upoV43, true);
    assert.equal(restored.offlineMode, true);
    assert.deepEqual(restored.partUploadRequests[1].headers, {});

    const stateNoFlags = {
      referenceNumber: "BR2",
      encryptionData: state.encryptionData,
      batchFile: state.batchFile,
      partUploadRequests: [{ ordinalNumber: 1, method: "PUT", url: "u1", headers: { a: "1" } }],
      encryptedPartsBase64: ["QUFB"],
    };
    const serializedNoFlags = serializeBatchSessionState(stateNoFlags);
    assert.equal(serializedNoFlags.upoV43, undefined);
    assert.equal(serializedNoFlags.offlineMode, undefined);
    const restoredNoFlags = deserializeBatchSessionState(serializedNoFlags);
    assert.equal(restoredNoFlags.upoV43, undefined);
    assert.equal(restoredNoFlags.offlineMode, undefined);

    const restoredFromHeaderless = deserializeBatchSessionState({
      referenceNumber: "BR3",
      encryptionData: {
        cipherKeyBase64: Buffer.alloc(32, 5).toString("base64"),
        cipherIvBase64: Buffer.alloc(16, 6).toString("base64"),
        encryptionInfo: { encryptedSymmetricKey: "k", initializationVector: "i" },
      },
      batchFile: { fileSize: 3, fileHash: "h", fileParts: [] },
      partUploadRequests: [{ ordinalNumber: 1, method: "PUT", url: "u1" }],
      encryptedPartsBase64: ["QUFB"],
    });
    assert.deepEqual(restoredFromHeaderless.partUploadRequests[0].headers, {});
  } finally {
    await loaded.dispose();
  }
});

test("sessionStore: save/load roundtrip and overwrite guard", async () => {
  const loaded = await loadSessionStoreModule();
  const cliHome = await mkdtemp(path.join(os.tmpdir(), "ksef-store-"));
  try {
    const { saveCheckpoint, loadCheckpoint, SessionStoreError } = loaded.module;
    const checkpoint = onlineCheckpoint({ id: "roundtrip" });
    const savedPath = await saveCheckpoint(cliHome, checkpoint);
    assert.ok(savedPath.endsWith(path.join("sessions", "default", "roundtrip.json")));

    const reloaded = await loadCheckpoint(cliHome, "default", "roundtrip");
    assert.equal(reloaded.id, "roundtrip");
    assert.equal(reloaded.kind, "online");

    await assert.rejects(
      () => saveCheckpoint(cliHome, checkpoint, { overwrite: false }),
      (error) => {
        assert.ok(error instanceof SessionStoreError);
        assert.equal(error.kind, "validation");
        assert.match(error.message, /already exists/);
        return true;
      },
    );

    const freshPath = await saveCheckpoint(cliHome, onlineCheckpoint({ id: "fresh" }), {
      overwrite: false,
    });
    assert.ok(freshPath.endsWith("fresh.json"));
  } finally {
    await rm(cliHome, { recursive: true, force: true });
    await loaded.dispose();
  }
});

test("sessionStore: saveCheckpoint reports write failures as config errors", async () => {
  const loaded = await loadSessionStoreModule();
  const base = await mkdtemp(path.join(os.tmpdir(), "ksef-store-"));
  try {
    const { saveCheckpoint, SessionStoreError } = loaded.module;
    const checkpointDir = path.join(base, "cache", "sessions", "default", "blocked.json");
    await mkdir(checkpointDir, { recursive: true });
    await writeFile(path.join(checkpointDir, "keep"), "x", "utf8");
    await assert.rejects(
      () => saveCheckpoint(base, onlineCheckpoint({ id: "blocked" })),
      (error) => {
        assert.ok(error instanceof SessionStoreError);
        assert.equal(error.kind, "config");
        assert.match(error.message, /Cannot persist session checkpoint/);
        return true;
      },
    );
  } finally {
    await rm(base, { recursive: true, force: true });
    await loaded.dispose();
  }
});

test("sessionStore: loadCheckpoint reports missing checkpoint and rethrows unexpected stat errors", async () => {
  const loaded = await loadSessionStoreModule();
  const cliHome = await mkdtemp(path.join(os.tmpdir(), "ksef-store-"));
  try {
    const { loadCheckpoint, SessionStoreError } = loaded.module;
    await assert.rejects(
      () => loadCheckpoint(cliHome, "default", "missing"),
      (error) => {
        assert.ok(error instanceof SessionStoreError);
        assert.equal(error.kind, "config");
        assert.match(error.message, /does not exist/);
        return true;
      },
    );

    const sessionsRoot = path.join(cliHome, "cache", "sessions");
    await mkdir(sessionsRoot, { recursive: true });
    await writeFile(path.join(sessionsRoot, "profile-as-file"), "x", "utf8");
    await assert.rejects(
      () => loadCheckpoint(cliHome, "profile-as-file", "id"),
      (error) => {
        assert.ok(!(error instanceof SessionStoreError));
        return true;
      },
    );
  } finally {
    await rm(cliHome, { recursive: true, force: true });
    await loaded.dispose();
  }
});

test("sessionStore: listCheckpoints handles empty, populated, malformed and rethrown errors", async () => {
  const loaded = await loadSessionStoreModule();
  const cliHome = await mkdtemp(path.join(os.tmpdir(), "ksef-store-"));
  try {
    const { saveCheckpoint, listCheckpoints } = loaded.module;

    assert.deepEqual(await listCheckpoints(cliHome, "default"), []);

    await saveCheckpoint(cliHome, onlineCheckpoint({ id: "a-online" }));
    await saveCheckpoint(cliHome, batchCheckpoint({ id: "b-batch" }));

    const directory = path.join(cliHome, "cache", "sessions", "default");
    await writeFile(path.join(directory, "malformed.json"), "not json", "utf8");
    await writeFile(path.join(directory, "ignored.txt"), "skip", "utf8");
    await mkdir(path.join(directory, "as-directory.json"), { recursive: true });

    const items = await listCheckpoints(cliHome, "default");
    assert.equal(items.length, 2);
    assert.deepEqual(
      items.map((item) => item.id).sort(),
      ["a-online", "b-batch"],
    );

    const sessionsRoot = path.join(cliHome, "cache", "sessions");
    await writeFile(path.join(sessionsRoot, "file-profile"), "x", "utf8");
    await assert.rejects(() => listCheckpoints(cliHome, "file-profile"));
  } finally {
    await rm(cliHome, { recursive: true, force: true });
    await loaded.dispose();
  }
});

test("sessionStore: deleteCheckpoint success, missing and unexpected errors", async () => {
  const loaded = await loadSessionStoreModule();
  const cliHome = await mkdtemp(path.join(os.tmpdir(), "ksef-store-"));
  try {
    const { saveCheckpoint, deleteCheckpoint, loadCheckpoint, SessionStoreError } = loaded.module;
    await saveCheckpoint(cliHome, onlineCheckpoint({ id: "to-delete" }));
    await deleteCheckpoint(cliHome, "default", "to-delete");
    await assert.rejects(() => loadCheckpoint(cliHome, "default", "to-delete"));

    await assert.rejects(
      () => deleteCheckpoint(cliHome, "default", "to-delete"),
      (error) => {
        assert.ok(error instanceof SessionStoreError);
        assert.equal(error.kind, "config");
        assert.match(error.message, /does not exist/);
        return true;
      },
    );

    const sessionsRoot = path.join(cliHome, "cache", "sessions");
    await mkdir(sessionsRoot, { recursive: true });
    await writeFile(path.join(sessionsRoot, "file-profile"), "x", "utf8");
    await assert.rejects(
      () => deleteCheckpoint(cliHome, "file-profile", "id"),
      (error) => {
        assert.ok(error instanceof SessionStoreError);
        assert.equal(error.kind, "config");
        assert.match(error.message, /Cannot delete session checkpoint/);
        return true;
      },
    );
  } finally {
    await rm(cliHome, { recursive: true, force: true });
    await loaded.dispose();
  }
});

test("sessionStore: updateCheckpoint persists changes with a new timestamp", async () => {
  const loaded = await loadSessionStoreModule();
  const cliHome = await mkdtemp(path.join(os.tmpdir(), "ksef-store-"));
  try {
    const { saveCheckpoint, updateCheckpoint, loadCheckpoint } = loaded.module;
    const checkpoint = onlineCheckpoint({ id: "updatable" });
    await saveCheckpoint(cliHome, checkpoint);
    const updated = await updateCheckpoint(cliHome, checkpoint, { stage: "closed" });
    assert.equal(updated.stage, "closed");
    assert.notEqual(updated.updatedAt, checkpoint.updatedAt);
    const reloaded = await loadCheckpoint(cliHome, "default", "updatable");
    assert.equal(reloaded.stage, "closed");
  } finally {
    await rm(cliHome, { recursive: true, force: true });
    await loaded.dispose();
  }
});

test("sessionStore: exportCheckpoint resolves directories, files and rethrows unexpected errors", async () => {
  const loaded = await loadSessionStoreModule();
  const cliHome = await mkdtemp(path.join(os.tmpdir(), "ksef-store-"));
  try {
    const { saveCheckpoint, exportCheckpoint } = loaded.module;
    await saveCheckpoint(cliHome, onlineCheckpoint({ id: "exportable" }));

    const trailingDir = path.join(cliHome, "trailing");
    await mkdir(trailingDir, { recursive: true });
    const trailingTarget = await exportCheckpoint(
      cliHome,
      "default",
      "exportable",
      `${trailingDir}/`,
    );
    assert.ok(trailingTarget.endsWith(path.join("trailing", "session-exportable.json")));
    assert.match(await readFile(trailingTarget, "utf8"), /exportable/);

    const existingDir = path.join(cliHome, "existing");
    await mkdir(existingDir, { recursive: true });
    const dirTarget = await exportCheckpoint(cliHome, "default", "exportable", existingDir);
    assert.ok(dirTarget.endsWith(path.join("existing", "session-exportable.json")));

    const fileTarget = path.join(cliHome, "explicit.json");
    const explicit = await exportCheckpoint(cliHome, "default", "exportable", fileTarget);
    assert.equal(explicit, path.resolve(fileTarget));
    assert.match(await readFile(explicit, "utf8"), /exportable/);

    const blocker = path.join(cliHome, "blocker");
    await writeFile(blocker, "file", "utf8");
    await assert.rejects(() =>
      exportCheckpoint(cliHome, "default", "exportable", path.join(blocker, "nested.json")),
    );
  } finally {
    await rm(cliHome, { recursive: true, force: true });
    await loaded.dispose();
  }
});

test("sessionStore: importCheckpoint handles overrides, mismatches and invalid sources", async () => {
  const loaded = await loadSessionStoreModule();
  const cliHome = await mkdtemp(path.join(os.tmpdir(), "ksef-store-"));
  try {
    const { saveCheckpoint, exportCheckpoint, importCheckpoint, loadCheckpoint, SessionStoreError } =
      loaded.module;
    await saveCheckpoint(cliHome, onlineCheckpoint({ id: "source" }));
    const exportedFile = path.join(cliHome, "exported.json");
    await exportCheckpoint(cliHome, "default", "source", exportedFile);

    const imported = await importCheckpoint(cliHome, "default", exportedFile);
    assert.equal(imported.id, "source");

    const renamed = await importCheckpoint(cliHome, "default", exportedFile, {
      sessionId: "renamed",
    });
    assert.equal(renamed.id, "renamed");
    assert.equal((await loadCheckpoint(cliHome, "default", "renamed")).id, "renamed");

    const otherProfileFile = path.join(cliHome, "other-profile.json");
    await writeFile(
      otherProfileFile,
      JSON.stringify(onlineCheckpoint({ id: "foreign", profile: "other" }), null, 2),
      "utf8",
    );
    await assert.rejects(
      () => importCheckpoint(cliHome, "default", otherProfileFile),
      (error) => {
        assert.ok(error instanceof SessionStoreError);
        assert.equal(error.kind, "validation");
        assert.match(error.message, /selected profile/);
        return true;
      },
    );

    await assert.rejects(
      () => importCheckpoint(cliHome, "default", path.join(cliHome, "does-not-exist.json")),
      (error) => {
        assert.ok(error instanceof SessionStoreError);
        assert.equal(error.kind, "io");
        assert.match(error.message, /does not exist/);
        return true;
      },
    );

    const directorySource = path.join(cliHome, "as-dir");
    await mkdir(directorySource, { recursive: true });
    await assert.rejects(
      () => importCheckpoint(cliHome, "default", directorySource),
      (error) => {
        assert.ok(error instanceof SessionStoreError);
        assert.equal(error.kind, "io");
        assert.match(error.message, /not a file/);
        return true;
      },
    );

    const blocker = path.join(cliHome, "blocker-file");
    await writeFile(blocker, "file", "utf8");
    await assert.rejects(() =>
      importCheckpoint(cliHome, "default", path.join(blocker, "nested.json")),
    );
  } finally {
    await rm(cliHome, { recursive: true, force: true });
    await loaded.dispose();
  }
});

test("sessionStore: loadCheckpoint validates malformed checkpoint payloads", async () => {
  const loaded = await loadSessionStoreModule();
  const cliHome = await mkdtemp(path.join(os.tmpdir(), "ksef-store-"));
  try {
    const { loadCheckpoint } = loaded.module;

    await writeRawCheckpoint(cliHome, "default", "bad-json", "not json{");
    await assert.rejects(
      () => loadCheckpoint(cliHome, "default", "bad-json"),
      /Invalid session checkpoint JSON/,
    );

    // Force JSON.parse to throw a non-Error value to cover the String(error) fallback.
    const sentinel = "__THROW_NON_ERROR__";
    await writeRawCheckpoint(cliHome, "default", "non-error-json", sentinel);
    const originalParse = JSON.parse;
    JSON.parse = (text, ...rest) => {
      if (text === sentinel) {
        throw "non-error string";
      }
      return originalParse(text, ...rest);
    };
    try {
      await assert.rejects(
        () => loadCheckpoint(cliHome, "default", "non-error-json"),
        /Invalid session checkpoint JSON: non-error string/,
      );
    } finally {
      JSON.parse = originalParse;
    }

    await writeRawCheckpoint(cliHome, "default", "not-object", "123");
    await assert.rejects(
      () => loadCheckpoint(cliHome, "default", "not-object"),
      /Invalid session checkpoint payload/,
    );

    await writeRawCheckpoint(
      cliHome,
      "default",
      "bad-version",
      JSON.stringify(onlineCheckpoint({ schemaVersion: 2 })),
    );
    await assert.rejects(
      () => loadCheckpoint(cliHome, "default", "bad-version"),
      /Unsupported checkpoint schemaVersion/,
    );

    await writeRawCheckpoint(
      cliHome,
      "default",
      "bad-kind",
      JSON.stringify(onlineCheckpoint({ kind: "weird" })),
    );
    await assert.rejects(
      () => loadCheckpoint(cliHome, "default", "bad-kind"),
      /Unsupported checkpoint kind/,
    );

    const missingId = onlineCheckpoint();
    delete missingId.id;
    await writeRawCheckpoint(cliHome, "default", "missing-id", JSON.stringify(missingId));
    await assert.rejects(() => loadCheckpoint(cliHome, "default", "missing-id"), /Invalid id/);

    await writeRawCheckpoint(
      cliHome,
      "default",
      "blank-profile",
      JSON.stringify(onlineCheckpoint({ profile: "   " })),
    );
    await assert.rejects(
      () => loadCheckpoint(cliHome, "default", "blank-profile"),
      /Invalid profile/,
    );

    await writeRawCheckpoint(
      cliHome,
      "default",
      "bad-invoice-ref",
      JSON.stringify(onlineCheckpoint({ lastInvoiceRef: 123 })),
    );
    await assert.rejects(
      () => loadCheckpoint(cliHome, "default", "bad-invoice-ref"),
      /Invalid lastInvoiceRef/,
    );

    await writeRawCheckpoint(
      cliHome,
      "default",
      "bad-sent-refs",
      JSON.stringify(onlineCheckpoint({ sentInvoiceRefs: [1] })),
    );
    await assert.rejects(
      () => loadCheckpoint(cliHome, "default", "bad-sent-refs"),
      /expected string array/,
    );
  } finally {
    await rm(cliHome, { recursive: true, force: true });
    await loaded.dispose();
  }
});

test("sessionStore: loadCheckpoint accepts valid online and batch payloads", async () => {
  const loaded = await loadSessionStoreModule();
  const cliHome = await mkdtemp(path.join(os.tmpdir(), "ksef-store-"));
  try {
    const { loadCheckpoint } = loaded.module;

    await writeRawCheckpoint(
      cliHome,
      "default",
      "online-filled",
      JSON.stringify(onlineCheckpoint({ lastInvoiceRef: "INV-7", sentInvoiceRefs: ["r1"] })),
    );
    const onlineFilled = await loadCheckpoint(cliHome, "default", "online-filled");
    assert.equal(onlineFilled.lastInvoiceRef, "INV-7");
    assert.deepEqual(onlineFilled.sentInvoiceRefs, ["r1"]);

    const onlineMinimal = onlineCheckpoint({ lastInvoiceRef: null });
    delete onlineMinimal.sentInvoiceRefs;
    await writeRawCheckpoint(
      cliHome,
      "default",
      "online-minimal",
      JSON.stringify(onlineMinimal),
    );
    const onlineLoaded = await loadCheckpoint(cliHome, "default", "online-minimal");
    assert.equal(onlineLoaded.lastInvoiceRef, null);
    assert.deepEqual(onlineLoaded.sentInvoiceRefs, []);

    await writeRawCheckpoint(
      cliHome,
      "default",
      "batch-filled",
      JSON.stringify(batchCheckpoint({ lastUpoRef: "UPO-2", uploadedOrdinals: [1] })),
    );
    const batchFilled = await loadCheckpoint(cliHome, "default", "batch-filled");
    assert.equal(batchFilled.lastUpoRef, "UPO-2");
    assert.deepEqual(batchFilled.uploadedOrdinals, [1]);

    const batchMinimal = batchCheckpoint({ lastUpoRef: null });
    delete batchMinimal.uploadedOrdinals;
    await writeRawCheckpoint(cliHome, "default", "batch-minimal", JSON.stringify(batchMinimal));
    const batchLoaded = await loadCheckpoint(cliHome, "default", "batch-minimal");
    assert.equal(batchLoaded.lastUpoRef, null);
    assert.deepEqual(batchLoaded.uploadedOrdinals, []);
  } finally {
    await rm(cliHome, { recursive: true, force: true });
    await loaded.dispose();
  }
});

test("sessionStore: loadCheckpoint validates batch payloadSource and ordinals", async () => {
  const loaded = await loadSessionStoreModule();
  const cliHome = await mkdtemp(path.join(os.tmpdir(), "ksef-store-"));
  try {
    const { loadCheckpoint } = loaded.module;

    const missingSource = batchCheckpoint();
    delete missingSource.payloadSource;
    await writeRawCheckpoint(
      cliHome,
      "default",
      "missing-source",
      JSON.stringify(missingSource),
    );
    await assert.rejects(
      () => loadCheckpoint(cliHome, "default", "missing-source"),
      /Invalid payloadSource: expected object/,
    );

    await writeRawCheckpoint(
      cliHome,
      "default",
      "bad-source-kind",
      JSON.stringify(batchCheckpoint({ payloadSource: { kind: "tar", path: "p", sourceSha256Base64: "h", sourceSize: 1 } })),
    );
    await assert.rejects(
      () => loadCheckpoint(cliHome, "default", "bad-source-kind"),
      /Invalid payloadSource\.kind/,
    );

    await writeRawCheckpoint(
      cliHome,
      "default",
      "bad-source-size",
      JSON.stringify(batchCheckpoint({ payloadSource: { kind: "zip", path: "p", sourceSha256Base64: "h", sourceSize: -1 } })),
    );
    await assert.rejects(
      () => loadCheckpoint(cliHome, "default", "bad-source-size"),
      /Invalid payloadSource\.sourceSize/,
    );

    await writeRawCheckpoint(
      cliHome,
      "default",
      "bad-ordinals",
      JSON.stringify(batchCheckpoint({ uploadedOrdinals: [-1] })),
    );
    await assert.rejects(
      () => loadCheckpoint(cliHome, "default", "bad-ordinals"),
      /expected integer array/,
    );
  } finally {
    await rm(cliHome, { recursive: true, force: true });
    await loaded.dispose();
  }
});
