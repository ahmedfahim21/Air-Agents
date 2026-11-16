import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import { derToRaw, SignatureFormatError, signedMessage, verifyDeviceSignature } from "./deviceSignature.ts";

/** `r || s` to DER, the way the Secure Enclave returns it. */
function rawToDer(raw: Uint8Array): Uint8Array {
  const int = (n: Uint8Array) => {
    let i = 0;
    while (i < n.length - 1 && n[i] === 0) i++;
    const trimmed = n.subarray(i);
    const body = trimmed[0] & 0x80 ? new Uint8Array([0, ...trimmed]) : trimmed;
    return new Uint8Array([0x02, body.length, ...body]);
  };
  const r = int(raw.subarray(0, 32));
  const s = int(raw.subarray(32));
  return new Uint8Array([0x30, r.length + s.length, ...r, ...s]);
}

async function device() {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const publicKey = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const sign = async (message: Uint8Array) =>
    rawToDer(new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, new Uint8Array(message))));
  return { publicKey, sign };
}

const fields = { actionId: "a1", argsHash: "9f2c", answer: "approved" as const, expiresAt: "2026-11-17T09:00:00Z" };

Deno.test("verify: a device's own signature over the approval verifies, many times over", async () => {
  // Repeated because DER lengths vary with the leading bits of r and s.
  for (let i = 0; i < 40; i++) {
    const d = await device();
    const message = signedMessage({ ...fields, actionId: `a${i}` });
    assertEquals(await verifyDeviceSignature(d.publicKey, await d.sign(message), message), true);
  }
});

Deno.test("verify: another device's key does not verify", async () => {
  const [mine, other] = [await device(), await device()];
  const message = signedMessage(fields);
  assertEquals(await verifyDeviceSignature(other.publicKey, await mine.sign(message), message), false);
});

Deno.test("verify: changing any signed field breaks the signature", async () => {
  const d = await device();
  const signature = await d.sign(signedMessage(fields));
  for (const changed of [
    { ...fields, actionId: "a2" },
    { ...fields, argsHash: "0000" },
    { ...fields, answer: "denied" as const },
    { ...fields, expiresAt: "2027-01-01T00:00:00Z" },
  ]) {
    assertEquals(await verifyDeviceSignature(d.publicKey, signature, signedMessage(changed)), false);
  }
});

Deno.test("signedMessage: fixed layout", () => {
  assertEquals(new TextDecoder().decode(signedMessage(fields)), "airAgents.approval.v1\na1\n9f2c\napproved\n2026-11-17T09:00:00Z");
});

Deno.test("derToRaw: pads short integers and strips the sign byte", () => {
  const der = new Uint8Array([0x30, 0x08, 0x02, 0x01, 0x05, 0x02, 0x03, 0x00, 0x80, 0x01]);
  const raw = derToRaw(der);
  assertEquals(raw.length, 64);
  assertEquals([raw[31], raw[62], raw[63]], [0x05, 0x80, 0x01]);
  assertEquals(raw.subarray(0, 31).every((b) => b === 0) && raw.subarray(32, 62).every((b) => b === 0), true);
});

Deno.test("derToRaw: rejects anything that is not exactly two integers in a sequence", () => {
  const cases: Array<[string, number[]]> = [
    ["not a sequence", [0x31, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x01]],
    ["wrong outer length", [0x30, 0x07, 0x02, 0x01, 0x01, 0x02, 0x01, 0x01]],
    ["not an integer", [0x30, 0x06, 0x04, 0x01, 0x01, 0x02, 0x01, 0x01]],
    ["integer past the end", [0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x05, 0x01]],
    ["trailing bytes", [0x30, 0x08, 0x02, 0x01, 0x01, 0x02, 0x01, 0x01, 0x00, 0x00]],
    ["empty", []],
  ];
  for (const [name, der] of cases) {
    assertThrows(() => derToRaw(new Uint8Array(der)), SignatureFormatError, undefined, name);
  }
});

Deno.test("verify: a malformed public key is a format error, not false", async () => {
  const d = await device();
  const message = signedMessage(fields);
  const signature = await d.sign(message);
  await assertRejects(() => verifyDeviceSignature(d.publicKey.subarray(1), signature, message), SignatureFormatError);
  const compressed = new Uint8Array(65);
  compressed[0] = 0x02;
  await assertRejects(() => verifyDeviceSignature(compressed, signature, message), SignatureFormatError);
  const offCurve = new Uint8Array(65).fill(1);
  offCurve[0] = 0x04;
  await assertRejects(() => verifyDeviceSignature(offCurve, signature, message), SignatureFormatError);
});
