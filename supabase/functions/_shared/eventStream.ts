// Decoder for AWS's binary event stream (`application/vnd.amazon.eventstream`), which Bedrock
// uses for streamed replies.
//
//   message = totalLength:u32 | headersLength:u32 | preludeCrc:u32 | headers | payload | messageCrc:u32
//   header  = nameLength:u8 | name | valueType:u8 | value
//
// Lengths and checksums are big-endian. Both checksums are CRC-32 and are verified here: a
// corrupted frame throws instead of being parsed.

export type StreamMessage = {
  /** String-valued headers, such as `:message-type` and `:event-type`. */
  headers: Record<string, string>;
  payload: Uint8Array;
};

export class EventStreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventStreamError";
  }
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const PRELUDE = 12;
const TRAILER = 4;
const MAX_MESSAGE = 16 * 1024 * 1024;

/** Header value types and how many bytes each takes after the type byte (`null`: length-prefixed). */
const FIXED_WIDTH: Record<number, number> = { 0: 0, 1: 0, 2: 1, 3: 2, 4: 4, 5: 8, 8: 8, 9: 16 };

function readHeaders(bytes: Uint8Array): Record<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = new TextDecoder();
  const headers: Record<string, string> = {};
  let at = 0;
  while (at < bytes.length) {
    const nameLength = view.getUint8(at);
    at += 1;
    const name = text.decode(bytes.subarray(at, at + nameLength));
    at += nameLength;
    const type = view.getUint8(at);
    at += 1;
    if (type === 6 || type === 7) {
      const length = view.getUint16(at);
      at += 2;
      if (type === 7) headers[name] = text.decode(bytes.subarray(at, at + length));
      at += length;
    } else if (type in FIXED_WIDTH) {
      at += FIXED_WIDTH[type];
    } else {
      throw new EventStreamError(`Unknown header value type ${type} for "${name}"`);
    }
    if (at > bytes.length) throw new EventStreamError(`Header "${name}" runs past the end of the headers`);
  }
  return headers;
}

/**
 * Feed it chunks as they arrive; it returns every message completed so far and keeps the rest.
 * Call `end()` when the body closes: leftover bytes mean the stream was cut off.
 */
export class EventStreamDecoder {
  private pending = new Uint8Array(0);

  push(chunk: Uint8Array): StreamMessage[] {
    const joined = new Uint8Array(this.pending.length + chunk.length);
    joined.set(this.pending);
    joined.set(chunk, this.pending.length);
    this.pending = joined;

    const messages: StreamMessage[] = [];
    while (this.pending.length >= PRELUDE) {
      const view = new DataView(this.pending.buffer, this.pending.byteOffset, this.pending.byteLength);
      const totalLength = view.getUint32(0);
      const headersLength = view.getUint32(4);
      if (crc32(this.pending.subarray(0, 8)) !== view.getUint32(8)) {
        throw new EventStreamError("Prelude checksum mismatch");
      }
      if (totalLength > MAX_MESSAGE || totalLength < PRELUDE + TRAILER + headersLength) {
        throw new EventStreamError(`Impossible message length ${totalLength}`);
      }
      if (this.pending.length < totalLength) break;

      const message = this.pending.subarray(0, totalLength);
      if (crc32(message.subarray(0, totalLength - TRAILER)) !== view.getUint32(totalLength - TRAILER)) {
        throw new EventStreamError("Message checksum mismatch");
      }
      messages.push({
        headers: readHeaders(message.subarray(PRELUDE, PRELUDE + headersLength)),
        payload: message.slice(PRELUDE + headersLength, totalLength - TRAILER),
      });
      this.pending = this.pending.slice(totalLength);
    }
    return messages;
  }

  end(): void {
    if (this.pending.length > 0) {
      throw new EventStreamError(`Stream ended mid-message with ${this.pending.length} bytes left over`);
    }
  }
}

/** Builds one message. Used by tests to stand in for Bedrock. */
export function encodeMessage(headers: Record<string, string>, payload: Uint8Array): Uint8Array {
  const text = new TextEncoder();
  const parts: Uint8Array[] = [];
  for (const [name, value] of Object.entries(headers)) {
    const n = text.encode(name);
    const v = text.encode(value);
    const part = new Uint8Array(1 + n.length + 1 + 2 + v.length);
    part[0] = n.length;
    part.set(n, 1);
    part[1 + n.length] = 7;
    new DataView(part.buffer).setUint16(2 + n.length, v.length);
    part.set(v, 4 + n.length);
    parts.push(part);
  }
  const headersLength = parts.reduce((sum, p) => sum + p.length, 0);
  const totalLength = PRELUDE + headersLength + payload.length + TRAILER;
  const out = new Uint8Array(totalLength);
  const view = new DataView(out.buffer);
  view.setUint32(0, totalLength);
  view.setUint32(4, headersLength);
  view.setUint32(8, crc32(out.subarray(0, 8)));
  let at = PRELUDE;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  out.set(payload, at);
  view.setUint32(totalLength - TRAILER, crc32(out.subarray(0, totalLength - TRAILER)));
  return out;
}
