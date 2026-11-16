import { assertEquals, assertThrows } from "@std/assert";
import { crc32, encodeMessage, EventStreamDecoder, EventStreamError } from "./eventStream.ts";

const bytes = (s: string) => new TextEncoder().encode(s);
const text = (b: Uint8Array) => new TextDecoder().decode(b);

Deno.test("crc32: matches the standard check value", () => {
  assertEquals(crc32(bytes("123456789")), 0xcbf43926);
});

Deno.test("decoder: one message, headers and payload intact", () => {
  const frame = encodeMessage({ ":message-type": "event", ":event-type": "messageStart" }, bytes('{"role":"assistant"}'));
  const decoder = new EventStreamDecoder();
  const out = decoder.push(frame);
  decoder.end();
  assertEquals(out.length, 1);
  assertEquals(out[0].headers, { ":message-type": "event", ":event-type": "messageStart" });
  assertEquals(text(out[0].payload), '{"role":"assistant"}');
});

Deno.test("decoder: two messages split at every possible byte boundary", () => {
  const a = encodeMessage({ ":event-type": "a" }, bytes("first"));
  const b = encodeMessage({ ":event-type": "b" }, bytes("second, longer"));
  const all = new Uint8Array(a.length + b.length);
  all.set(a);
  all.set(b, a.length);
  for (let cut = 0; cut <= all.length; cut++) {
    const decoder = new EventStreamDecoder();
    const out = [...decoder.push(all.subarray(0, cut)), ...decoder.push(all.subarray(cut))];
    decoder.end();
    assertEquals(out.map((m) => [m.headers[":event-type"], text(m.payload)]), [["a", "first"], ["b", "second, longer"]]);
  }
});

Deno.test("decoder: empty payload and no headers", () => {
  const decoder = new EventStreamDecoder();
  const out = decoder.push(encodeMessage({}, new Uint8Array(0)));
  assertEquals(out.length, 1);
  assertEquals(out[0].headers, {});
  assertEquals(out[0].payload.length, 0);
});

Deno.test("decoder: a flipped payload byte fails the message checksum", () => {
  const frame = encodeMessage({ ":event-type": "a" }, bytes("payload"));
  frame[frame.length - 6] ^= 0xff;
  assertThrows(() => new EventStreamDecoder().push(frame), EventStreamError, "Message checksum mismatch");
});

Deno.test("decoder: a flipped length byte fails the prelude checksum", () => {
  const frame = encodeMessage({ ":event-type": "a" }, bytes("payload"));
  frame[3] ^= 0x01;
  assertThrows(() => new EventStreamDecoder().push(frame), EventStreamError, "Prelude checksum mismatch");
});

Deno.test("decoder: a stream cut off mid-message throws at end()", () => {
  const frame = encodeMessage({ ":event-type": "a" }, bytes("payload"));
  const decoder = new EventStreamDecoder();
  assertEquals(decoder.push(frame.subarray(0, frame.length - 3)), []);
  assertThrows(() => decoder.end(), EventStreamError, "ended mid-message");
});
