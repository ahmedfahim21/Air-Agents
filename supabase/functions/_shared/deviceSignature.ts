// Checks a tier-three approval signature made by a device key in the iPhone's Secure Enclave.
//
// The Secure Enclave signs with ECDSA P-256 over SHA-256 and returns the signature DER-encoded
// (a SEQUENCE of two INTEGERs, r and s). WebCrypto wants r and s as two fixed 32-byte numbers,
// so the DER is unpacked first. Public keys arrive in the X9.63 form iOS exports: 65 bytes,
// 0x04 then x then y.

export class SignatureFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignatureFormatError";
  }
}

function readInteger(der: Uint8Array, at: number): { value: Uint8Array; next: number } {
  if (der[at] !== 0x02) throw new SignatureFormatError("Expected an INTEGER in the signature");
  const length = der[at + 1];
  if (length === undefined || length === 0 || length > 33) throw new SignatureFormatError("Bad INTEGER length in the signature");
  const end = at + 2 + length;
  if (end > der.length) throw new SignatureFormatError("Signature INTEGER runs past the end");
  let value = der.subarray(at + 2, end);
  // A leading zero only marks the number as positive.
  if (value.length === 33) {
    if (value[0] !== 0) throw new SignatureFormatError("Signature INTEGER is too large for P-256");
    value = value.subarray(1);
  }
  return { value, next: end };
}

/** DER `SEQUENCE { r INTEGER, s INTEGER }` to the 64-byte `r || s` WebCrypto verifies. */
export function derToRaw(der: Uint8Array): Uint8Array<ArrayBuffer> {
  if (der.length < 8 || der.length > 72 || der[0] !== 0x30) throw new SignatureFormatError("Signature is not a DER SEQUENCE");
  if (der[1] !== der.length - 2) throw new SignatureFormatError("Signature SEQUENCE length does not match its size");
  const r = readInteger(der, 2);
  const s = readInteger(der, r.next);
  if (s.next !== der.length) throw new SignatureFormatError("Signature has trailing bytes");
  const raw = new Uint8Array(64);
  raw.set(r.value, 32 - r.value.length);
  raw.set(s.value, 64 - s.value.length);
  return raw;
}

/** What the device signs: every field that makes this answer this answer, in a fixed order. */
export function signedMessage(fields: { actionId: string; argsHash: string; answer: "approved" | "denied"; expiresAt: string }): Uint8Array {
  return new TextEncoder().encode(
    ["airAgents.approval.v1", fields.actionId, fields.argsHash, fields.answer, fields.expiresAt].join("\n"),
  );
}

/**
 * True only if `signatureDer` is a valid signature of `message` by `publicKeyX963`.
 * Throws `SignatureFormatError` when the key or signature is not even well-formed.
 */
export async function verifyDeviceSignature(publicKeyX963: Uint8Array, signatureDer: Uint8Array, message: Uint8Array): Promise<boolean> {
  if (publicKeyX963.length !== 65 || publicKeyX963[0] !== 0x04) {
    throw new SignatureFormatError("Public key is not an uncompressed P-256 point");
  }
  const raw = derToRaw(signatureDer);
  // Deno accepts a point that is not on the curve at import and only rejects it at verify, so
  // both steps are treated as "this key is unusable".
  try {
    const key = await crypto.subtle.importKey("raw", new Uint8Array(publicKeyX963), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    return await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, raw, new Uint8Array(message));
  } catch (cause) {
    throw new SignatureFormatError(`Public key was rejected: ${(cause as Error).message}`);
  }
}
