export function splitBuffer(buffer: Buffer, maxPartSize: number): Buffer[] {
  if (maxPartSize <= 0) {
    throw new Error("maxPartSize must be positive.");
  }
  if (buffer.length <= maxPartSize) {
    return [buffer];
  }
  const parts: Buffer[] = [];
  for (let offset = 0; offset < buffer.length; offset += maxPartSize) {
    parts.push(buffer.subarray(offset, offset + maxPartSize));
  }
  return parts;
}
