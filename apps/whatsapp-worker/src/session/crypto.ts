import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

// AES-256-GCM over the Baileys credential blobs. GCM rather than CBC
// because it authenticates as well as encrypts: a row altered in the
// database (or swapped between accounts) fails to decrypt instead of
// yielding attacker-chosen plaintext.

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // 96 bits, the size GCM is specified for
const KEY_BYTES = 32;

export type EncryptedPayload = {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
};

export class DecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecryptionError";
  }
}

function assertKey(key: Buffer): void {
  if (key.length !== KEY_BYTES) {
    throw new Error(`Encryption key must be ${KEY_BYTES} bytes, received ${key.length}`);
  }
}

/**
 * `aad` binds the ciphertext to its identity (account + category + key id).
 * Without it, a row could be copied from one account to another and would
 * still decrypt cleanly — GCM would authenticate the bytes but not where
 * they belong.
 */
export function encrypt(key: Buffer, plaintext: Buffer, aad?: Buffer): EncryptedPayload {
  assertKey(key);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  if (aad) cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { ciphertext, iv, authTag: cipher.getAuthTag() };
}

export function decrypt(key: Buffer, payload: EncryptedPayload, aad?: Buffer): Buffer {
  assertKey(key);
  const decipher = createDecipheriv(ALGORITHM, key, payload.iv);
  if (aad) decipher.setAAD(aad);
  decipher.setAuthTag(payload.authTag);
  try {
    return Buffer.concat([decipher.update(payload.ciphertext), decipher.final()]);
  } catch {
    // Deliberately opaque: the caller learns the row is unusable, not
    // which part of it failed to authenticate.
    throw new DecryptionError("Stored credential failed authentication and cannot be decrypted");
  }
}

export function encryptJson(key: Buffer, value: unknown, aad?: Buffer): EncryptedPayload {
  return encrypt(key, Buffer.from(JSON.stringify(value), "utf8"), aad);
}

export function decryptJson<T>(key: Buffer, payload: EncryptedPayload, aad?: Buffer): T {
  return JSON.parse(decrypt(key, payload, aad).toString("utf8")) as T;
}

/** Constant-time comparison, used by the lock's owner check. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
