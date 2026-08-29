import { gunzipSync } from "node:zlib";
import { ZipFile } from "yazl";
import { fromBuffer, Entry } from "yauzl";

export interface ZipEntryInput {
  fileName: string;
  content: Buffer | Uint8Array;
}

export interface UnzipOptions {
  maxFiles?: number;
  maxTotalUncompressedSize?: number;
  maxFileUncompressedSize?: number;
  maxCompressionRatio?: number | null;
}

const DEFAULT_UNZIP_OPTIONS: Required<UnzipOptions> = {
  maxFiles: 10_000,
  maxTotalUncompressedSize: 2_000_000_000,
  maxFileUncompressedSize: 500_000_000,
  maxCompressionRatio: 200,
};

export async function createZip(entries: ZipEntryInput[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const zipfile = new ZipFile();
    for (const entry of entries) {
      zipfile.addBuffer(Buffer.from(entry.content), entry.fileName);
    }

    const chunks: Buffer[] = [];
    zipfile.outputStream.on("data", (chunk: Buffer) => chunks.push(chunk));
    zipfile.outputStream.on("error", (err) => reject(err));
    zipfile.outputStream.on("end", () => resolve(Buffer.concat(chunks)));
    zipfile.end();
  });
}

export async function unzip(
  buffer: Buffer,
  options: UnzipOptions = {},
): Promise<Map<string, Buffer>> {
  const limits = { ...DEFAULT_UNZIP_OPTIONS, ...options };
  return new Promise((resolve, reject) => {
    fromBuffer(buffer, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) {
        reject(err ?? new Error("Failed to open zip buffer."));
        return;
      }

      const files = new Map<string, Buffer>();
      let totalUncompressed = 0;
      zipfile.readEntry();
      zipfile.on("entry", (entry: Entry) => {
        if (entry.fileName.endsWith("/")) {
          zipfile.readEntry();
          return;
        }

        if (files.size >= limits.maxFiles) {
          reject(new Error("zip contains too many files"));
          return;
        }

        const uncompressedSize = entry.uncompressedSize ?? 0;
        const compressedSize = entry.compressedSize ?? 0;

        if (uncompressedSize > limits.maxFileUncompressedSize) {
          reject(new Error("zip entry exceeds max_file_uncompressed_size"));
          return;
        }

        totalUncompressed += uncompressedSize;
        if (totalUncompressed > limits.maxTotalUncompressedSize) {
          reject(new Error("zip exceeds max_total_uncompressed_size"));
          return;
        }

        if (limits.maxCompressionRatio !== null) {
          if (compressedSize === 0 && uncompressedSize > 0) {
            reject(new Error("zip entry has suspicious compression metadata"));
            return;
          }
          if (compressedSize > 0 && uncompressedSize > 0) {
            const ratio = uncompressedSize / compressedSize;
            if (ratio > limits.maxCompressionRatio) {
              reject(new Error("zip entry exceeds max_compression_ratio"));
              return;
            }
          }
        }

        zipfile.openReadStream(entry, (streamErr, stream) => {
          if (streamErr || !stream) {
            reject(streamErr ?? new Error("Failed to read zip entry."));
            return;
          }
          const chunks: Buffer[] = [];
          stream.on("data", (chunk: Buffer) => chunks.push(chunk));
          stream.on("error", (streamError) => reject(streamError));
          stream.on("end", () => {
            files.set(entry.fileName, Buffer.concat(chunks));
            zipfile.readEntry();
          });
        });
      });
      zipfile.on("end", () => resolve(files));
      zipfile.on("error", (zipErr) => reject(zipErr));
    });
  });
}

const TAR_BLOCK_SIZE = 512;

export async function untarGz(
  buffer: Buffer,
  options: UnzipOptions = {},
): Promise<Map<string, Buffer>> {
  const limits = { ...DEFAULT_UNZIP_OPTIONS, ...options };
  validateArchiveLimits(limits);

  const compressedSize = Math.max(buffer.length, 1);
  let tarBuffer: Buffer;
  try {
    tarBuffer = gunzipSync(buffer);
  } catch {
    throw new Error("Failed to open tar.gz buffer.");
  }

  const files = new Map<string, Buffer>();
  let totalUncompressed = 0;
  let offset = 0;

  while (offset + TAR_BLOCK_SIZE <= tarBuffer.length) {
    const header = tarBuffer.subarray(offset, offset + TAR_BLOCK_SIZE);
    if (isZeroBlock(header)) {
      break;
    }

    const name = readTarString(header, 0, 100);
    const prefix = readTarString(header, 345, 155);
    const size = parseTarOctal(header.subarray(124, 136));
    const typeFlag = String.fromCharCode(header[156] as number);
    offset += TAR_BLOCK_SIZE;
    const paddedSize = Math.ceil(size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;

    if (typeFlag === "5" || name.endsWith("/")) {
      offset += paddedSize;
      continue;
    }
    if (typeFlag !== "0" && typeFlag !== "\0") {
      throw new Error("tar.gz entry must be a regular file");
    }
    if (offset + size > tarBuffer.length) {
      throw new Error("tar.gz entry could not be read");
    }

    if (files.size >= limits.maxFiles) {
      throw new Error("tar.gz contains too many files");
    }
    if (size > limits.maxFileUncompressedSize) {
      throw new Error("tar.gz contains an entry exceeding max_file_uncompressed_size");
    }

    totalUncompressed += size;
    if (totalUncompressed > limits.maxTotalUncompressedSize) {
      throw new Error("tar.gz exceeds max_total_uncompressed_size");
    }
    if (
      limits.maxCompressionRatio !== null &&
      totalUncompressed / compressedSize > limits.maxCompressionRatio
    ) {
      throw new Error("tar.gz exceeds max_compression_ratio");
    }

    const fullName = prefix ? `${prefix}/${name}` : name;
    const safeName = sanitizeArchiveEntryName(fullName, "tar.gz");
    files.set(safeName, Buffer.from(tarBuffer.subarray(offset, offset + size)));
    offset += paddedSize;
  }

  return files;
}

function validateArchiveLimits(limits: Required<UnzipOptions>): void {
  if (limits.maxFiles <= 0) {
    throw new Error("max_files must be positive");
  }
  if (limits.maxTotalUncompressedSize <= 0) {
    throw new Error("max_total_uncompressed_size must be positive");
  }
  if (limits.maxFileUncompressedSize <= 0) {
    throw new Error("max_file_uncompressed_size must be positive");
  }
  if (limits.maxCompressionRatio !== null && limits.maxCompressionRatio <= 0) {
    throw new Error("max_compression_ratio must be positive or None");
  }
}

function sanitizeArchiveEntryName(rawName: string, archiveType: string): string {
  const normalized = rawName.replaceAll("\\", "/");
  if (normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized) || normalized.includes(":")) {
    throw new Error(`${archiveType} entry path must be relative`);
  }
  const parts = normalized.split("/").filter((part) => part.length > 0);
  if (parts.length === 0 || parts.some((part) => part === "." || part === "..")) {
    throw new Error(`${archiveType} entry path contains unsafe segments`);
  }
  return parts.join("/");
}

function isZeroBlock(block: Buffer): boolean {
  for (const byte of block) {
    if (byte !== 0) {
      return false;
    }
  }
  return true;
}

function readTarString(header: Buffer, start: number, length: number): string {
  const slice = header.subarray(start, start + length);
  const end = slice.indexOf(0);
  return slice
    .subarray(0, end === -1 ? slice.length : end)
    .toString("utf8")
    .trim();
}

function parseTarOctal(value: Buffer): number {
  const text = value.toString("utf8").replaceAll("\0", "").trim();
  if (!text) {
    return 0;
  }
  const parsed = Number.parseInt(text, 8);
  return Number.isFinite(parsed) ? parsed : 0;
}
