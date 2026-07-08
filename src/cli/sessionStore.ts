import path from "node:path";
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { BatchSessionState } from "../services/batchSessionWorkflow";
import { OnlineSessionState } from "../services/onlineSessionWorkflow";

const CHECKPOINT_SCHEMA_VERSION = 1;
const SESSION_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function formatPersistenceError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type SessionStoreErrorKind = "validation" | "config" | "io";

export class SessionStoreError extends Error {
  readonly kind: SessionStoreErrorKind;

  constructor(message: string, kind: SessionStoreErrorKind) {
    super(message);
    this.kind = kind;
    this.name = "SessionStoreError";
  }
}

export interface BatchPayloadSource {
  kind: "zip" | "directory";
  path: string;
  sourceSha256Base64: string;
  sourceSize: number;
}

interface SerializedEncryptionData {
  cipherKeyBase64: string;
  cipherIvBase64: string;
  encryptionInfo: {
    encryptedSymmetricKey: string;
    initializationVector: string;
  };
}

interface SerializedOnlineSessionState {
  referenceNumber: string;
  encryptionData: SerializedEncryptionData;
  upoV43?: boolean;
}

interface SerializedBatchSessionState {
  referenceNumber: string;
  encryptionData: SerializedEncryptionData;
  batchFile: BatchSessionState["batchFile"];
  partUploadRequests: BatchSessionState["partUploadRequests"];
  encryptedPartsBase64: string[];
  upoV43?: boolean;
  offlineMode?: boolean;
}

export interface OnlineSessionCheckpoint {
  schemaVersion: 1;
  id: string;
  profile: string;
  baseUrl: string;
  kind: "online";
  createdAt: string;
  updatedAt: string;
  stage: string;
  sessionState: SerializedOnlineSessionState;
  lastInvoiceRef: string | null;
  sentInvoiceRefs: string[];
}

export interface BatchSessionCheckpoint {
  schemaVersion: 1;
  id: string;
  profile: string;
  baseUrl: string;
  kind: "batch";
  createdAt: string;
  updatedAt: string;
  stage: string;
  sessionState: SerializedBatchSessionState;
  payloadSource: BatchPayloadSource;
  uploadedOrdinals: number[];
  lastUpoRef: string | null;
}

export type SessionCheckpoint = OnlineSessionCheckpoint | BatchSessionCheckpoint;

export interface SessionCheckpointSummary {
  id: string;
  kind: "online" | "batch";
  profile: string;
  baseUrl: string;
  stage: string;
  createdAt: string;
  updatedAt: string;
  sessionRef: string;
  lastInvoiceRef?: string;
  sentInvoiceCount?: number;
  uploadedOrdinals?: number[];
  lastUpoRef?: string;
  payloadSource?: BatchPayloadSource;
}

export function validateSessionId(sessionId: string): string {
  const normalized = sessionId.trim();
  if (!SESSION_ID_RE.test(normalized)) {
    throw new SessionStoreError(
      "Invalid session id. Use 1-128 chars from: letters, digits, dot, dash, underscore.",
      "validation",
    );
  }
  return normalized;
}

export function summarizeCheckpoint(checkpoint: SessionCheckpoint): SessionCheckpointSummary {
  const payload: SessionCheckpointSummary = {
    id: checkpoint.id,
    kind: checkpoint.kind,
    profile: checkpoint.profile,
    baseUrl: checkpoint.baseUrl,
    stage: checkpoint.stage,
    createdAt: checkpoint.createdAt,
    updatedAt: checkpoint.updatedAt,
    sessionRef: checkpoint.sessionState.referenceNumber,
  };
  if (checkpoint.kind === "online") {
    payload.lastInvoiceRef = checkpoint.lastInvoiceRef ?? "";
    payload.sentInvoiceCount = checkpoint.sentInvoiceRefs.length;
  } else {
    payload.uploadedOrdinals = [...checkpoint.uploadedOrdinals];
    payload.lastUpoRef = checkpoint.lastUpoRef ?? "";
    payload.payloadSource = { ...checkpoint.payloadSource };
  }
  return payload;
}

export function serializeOnlineSessionState(state: OnlineSessionState): SerializedOnlineSessionState {
  return {
    referenceNumber: state.referenceNumber,
    encryptionData: {
      cipherKeyBase64: state.encryptionData.cipherKey.toString("base64"),
      cipherIvBase64: state.encryptionData.cipherIv.toString("base64"),
      encryptionInfo: {
        ...state.encryptionData.encryptionInfo,
      },
    },
    ...(state.upoV43 !== undefined ? { upoV43: state.upoV43 } : {}),
  };
}

export function deserializeOnlineSessionState(state: SerializedOnlineSessionState): OnlineSessionState {
  return {
    referenceNumber: state.referenceNumber,
    encryptionData: {
      cipherKey: Buffer.from(state.encryptionData.cipherKeyBase64, "base64"),
      cipherIv: Buffer.from(state.encryptionData.cipherIvBase64, "base64"),
      encryptionInfo: { ...state.encryptionData.encryptionInfo },
    },
    ...(state.upoV43 !== undefined ? { upoV43: state.upoV43 } : {}),
  };
}

export function serializeBatchSessionState(state: BatchSessionState): SerializedBatchSessionState {
  return {
    referenceNumber: state.referenceNumber,
    encryptionData: {
      cipherKeyBase64: state.encryptionData.cipherKey.toString("base64"),
      cipherIvBase64: state.encryptionData.cipherIv.toString("base64"),
      encryptionInfo: {
        ...state.encryptionData.encryptionInfo,
      },
    },
    batchFile: {
      fileSize: state.batchFile.fileSize,
      fileHash: state.batchFile.fileHash,
      fileParts: state.batchFile.fileParts.map((part) => ({ ...part })),
    },
    partUploadRequests: state.partUploadRequests.map((item) => ({
      ...item,
      headers: { ...(item.headers ?? {}) },
    })),
    encryptedPartsBase64: [...state.encryptedPartsBase64],
    ...(state.upoV43 !== undefined ? { upoV43: state.upoV43 } : {}),
    ...(state.offlineMode !== undefined ? { offlineMode: state.offlineMode } : {}),
  };
}

export function deserializeBatchSessionState(state: SerializedBatchSessionState): BatchSessionState {
  return {
    referenceNumber: state.referenceNumber,
    encryptionData: {
      cipherKey: Buffer.from(state.encryptionData.cipherKeyBase64, "base64"),
      cipherIv: Buffer.from(state.encryptionData.cipherIvBase64, "base64"),
      encryptionInfo: { ...state.encryptionData.encryptionInfo },
    },
    batchFile: {
      fileSize: state.batchFile.fileSize,
      fileHash: state.batchFile.fileHash,
      fileParts: state.batchFile.fileParts.map((part) => ({ ...part })),
    },
    partUploadRequests: state.partUploadRequests.map((item) => ({
      ...item,
      headers: { ...(item.headers ?? {}) },
    })),
    encryptedPartsBase64: [...state.encryptedPartsBase64],
    ...(state.upoV43 !== undefined ? { upoV43: state.upoV43 } : {}),
    ...(state.offlineMode !== undefined ? { offlineMode: state.offlineMode } : {}),
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function checkpointRoot(cliHome: string): string {
  return path.join(cliHome, "cache", "sessions");
}

function checkpointPath(cliHome: string, profile: string, sessionId: string): string {
  return path.join(checkpointRoot(cliHome), profile, `${validateSessionId(sessionId)}.json`);
}

async function writeJsonAtomic(targetPath: string, payload: unknown): Promise<void> {
  await mkdir(path.dirname(targetPath), { recursive: true });
  const tempPath = path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  const json = JSON.stringify(payload, null, 2);
  try {
    await writeFile(tempPath, json, "utf8");
    await rename(tempPath, targetPath);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    const message = formatPersistenceError(error);
    throw new SessionStoreError(`Cannot persist session checkpoint: ${message}`, "config");
  }
}

function ensureString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new SessionStoreError(`Invalid ${fieldName}: expected non-empty string.`, "config");
  }
  return value;
}

function ensureStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new SessionStoreError(`Invalid ${fieldName}: expected string array.`, "config");
  }
  return value;
}

function ensureNumberArray(value: unknown, fieldName: string): number[] {
  if (
    !Array.isArray(value) ||
    value.some((item) => !Number.isInteger(item) || (item as number) < 0)
  ) {
    throw new SessionStoreError(`Invalid ${fieldName}: expected integer array.`, "config");
  }
  return value as number[];
}

function parseCheckpoint(raw: unknown): SessionCheckpoint {
  if (!raw || typeof raw !== "object") {
    throw new SessionStoreError("Invalid session checkpoint payload.", "config");
  }

  const payload = raw as Record<string, unknown>;
  if (payload.schemaVersion !== CHECKPOINT_SCHEMA_VERSION) {
    throw new SessionStoreError(
      `Unsupported checkpoint schemaVersion: ${String(payload.schemaVersion)}.`,
      "config",
    );
  }

  const kind = payload.kind;
  if (kind !== "online" && kind !== "batch") {
    throw new SessionStoreError(`Unsupported checkpoint kind: ${String(kind)}.`, "config");
  }

  const common = {
    schemaVersion: 1 as const,
    id: validateSessionId(ensureString(payload.id, "id")),
    profile: ensureString(payload.profile, "profile"),
    baseUrl: ensureString(payload.baseUrl, "baseUrl"),
    kind,
    createdAt: ensureString(payload.createdAt, "createdAt"),
    updatedAt: ensureString(payload.updatedAt, "updatedAt"),
    stage: ensureString(payload.stage, "stage"),
  };

  if (kind === "online") {
    return {
      ...common,
      kind: "online",
      sessionState: payload.sessionState as SerializedOnlineSessionState,
      lastInvoiceRef:
        payload.lastInvoiceRef === null || payload.lastInvoiceRef === undefined
          ? null
          : ensureString(payload.lastInvoiceRef, "lastInvoiceRef"),
      sentInvoiceRefs: ensureStringArray(payload.sentInvoiceRefs ?? [], "sentInvoiceRefs"),
    };
  }

  if (!payload.payloadSource || typeof payload.payloadSource !== "object") {
    throw new SessionStoreError("Invalid payloadSource: expected object.", "config");
  }
  const source = payload.payloadSource as Record<string, unknown>;
  const sourceKind = source.kind;
  if (sourceKind !== "zip" && sourceKind !== "directory") {
    throw new SessionStoreError("Invalid payloadSource.kind.", "config");
  }
  const sourceSize = source.sourceSize;
  if (!Number.isInteger(sourceSize) || (sourceSize as number) < 0) {
    throw new SessionStoreError("Invalid payloadSource.sourceSize.", "config");
  }

  return {
    ...common,
    kind: "batch",
    sessionState: payload.sessionState as SerializedBatchSessionState,
    payloadSource: {
      kind: sourceKind,
      path: ensureString(source.path, "payloadSource.path"),
      sourceSha256Base64: ensureString(
        source.sourceSha256Base64,
        "payloadSource.sourceSha256Base64",
      ),
      sourceSize: sourceSize as number,
    },
    uploadedOrdinals: ensureNumberArray(payload.uploadedOrdinals ?? [], "uploadedOrdinals"),
    lastUpoRef:
      payload.lastUpoRef === null || payload.lastUpoRef === undefined
        ? null
        : ensureString(payload.lastUpoRef, "lastUpoRef"),
  };
}

async function readCheckpointFile(filePath: string): Promise<SessionCheckpoint> {
  let rawText: string;
  try {
    rawText = await readFile(filePath, "utf8");
  } catch (error) {
    const message = formatPersistenceError(error);
    throw new SessionStoreError(`Cannot read session checkpoint: ${message}`, "config");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawText);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new SessionStoreError(`Invalid session checkpoint JSON: ${message}`, "config");
  }
  return parseCheckpoint(payload);
}

export async function saveCheckpoint(
  cliHome: string,
  checkpoint: SessionCheckpoint,
  options: { overwrite?: boolean } = {},
): Promise<string> {
  const filePath = checkpointPath(cliHome, checkpoint.profile, checkpoint.id);
  const overwrite = options.overwrite ?? true;
  if (!overwrite) {
    try {
      await stat(filePath);
      throw new SessionStoreError(
        `Session checkpoint "${checkpoint.id}" already exists. Choose a different --id.`,
        "validation",
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }
  await writeJsonAtomic(filePath, checkpoint);
  return filePath;
}

export async function loadCheckpoint(
  cliHome: string,
  profile: string,
  sessionId: string,
): Promise<SessionCheckpoint> {
  const filePath = checkpointPath(cliHome, profile, sessionId);
  try {
    await stat(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new SessionStoreError(
        `Session checkpoint "${sessionId}" does not exist. Create it first with session open.`,
        "config",
      );
    }
    throw error;
  }
  return readCheckpointFile(filePath);
}

export async function listCheckpoints(
  cliHome: string,
  profile: string,
): Promise<SessionCheckpoint[]> {
  const directory = path.join(checkpointRoot(cliHome), profile);
  let entries: string[];
  try {
    entries = await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
  const checkpoints: SessionCheckpoint[] = [];
  for (const name of entries.filter((item) => item.endsWith(".json")).sort()) {
    try {
      checkpoints.push(await readCheckpointFile(path.join(directory, name)));
    } catch {
      // ignore malformed checkpoint files
    }
  }
  return checkpoints;
}

export async function deleteCheckpoint(
  cliHome: string,
  profile: string,
  sessionId: string,
): Promise<void> {
  const filePath = checkpointPath(cliHome, profile, sessionId);
  try {
    await unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new SessionStoreError(`Session checkpoint "${sessionId}" does not exist.`, "config");
    }
    const message = formatPersistenceError(error);
    throw new SessionStoreError(`Cannot delete session checkpoint: ${message}`, "config");
  }
}

export async function updateCheckpoint(
  cliHome: string,
  checkpoint: SessionCheckpoint,
  changes: Partial<SessionCheckpoint>,
): Promise<SessionCheckpoint> {
  const updated = {
    ...checkpoint,
    ...changes,
    updatedAt: nowIso(),
  } as SessionCheckpoint;
  await saveCheckpoint(cliHome, updated, { overwrite: true });
  return updated;
}

export async function exportCheckpoint(
  cliHome: string,
  profile: string,
  sessionId: string,
  outPath: string,
): Promise<string> {
  const checkpoint = await loadCheckpoint(cliHome, profile, sessionId);
  let target = path.resolve(outPath);
  const normalizedOut = outPath.replace(/\\/g, "/");
  if (normalizedOut.endsWith("/")) {
    target = path.join(target, `session-${checkpoint.id}.json`);
  } else {
    try {
      const info = await stat(target);
      if (info.isDirectory()) {
        target = path.join(target, `session-${checkpoint.id}.json`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }
  await writeJsonAtomic(target, checkpoint);
  return target;
}

export async function importCheckpoint(
  cliHome: string,
  profile: string,
  sourcePath: string,
  options: { sessionId?: string } = {},
): Promise<SessionCheckpoint> {
  const resolvedSource = path.resolve(sourcePath);
  let sourceInfo;
  try {
    sourceInfo = await stat(resolvedSource);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new SessionStoreError(`Checkpoint file does not exist: ${resolvedSource}`, "io");
    }
    throw error;
  }
  if (!sourceInfo.isFile()) {
    throw new SessionStoreError(`Checkpoint path is not a file: ${resolvedSource}`, "io");
  }

  const checkpoint = await readCheckpointFile(resolvedSource);
  if (checkpoint.profile !== profile) {
    throw new SessionStoreError(
      `Checkpoint profile is "${checkpoint.profile}", selected profile is "${profile}".`,
      "validation",
    );
  }

  const imported: SessionCheckpoint = options.sessionId
    ? { ...checkpoint, id: validateSessionId(options.sessionId), updatedAt: nowIso() }
    : checkpoint;

  await saveCheckpoint(cliHome, imported, { overwrite: true });
  return imported;
}
