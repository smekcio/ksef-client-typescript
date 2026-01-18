const CRC8_POLY = 0x07;

export function crc8(input: string): number {
  let crc = 0x00;
  const bytes = Buffer.from(input, "utf8");
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      if ((crc & 0x80) !== 0) {
        crc = ((crc << 1) ^ CRC8_POLY) & 0xff;
      } else {
        crc = (crc << 1) & 0xff;
      }
    }
  }
  return crc & 0xff;
}

export function crc8Hex(input: string): string {
  return crc8(input).toString(16).toUpperCase().padStart(2, "0");
}
