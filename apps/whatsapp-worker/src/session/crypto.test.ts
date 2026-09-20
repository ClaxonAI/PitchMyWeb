import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DecryptionError, decrypt, decryptJson, encrypt, encryptJson, safeEqual } from "./crypto.js";

const key = randomBytes(32);
const otherKey = randomBytes(32);

describe("crypto", () => {
  it("round-trips a buffer", () => {
    const plaintext = Buffer.from("the quick brown fox", "utf8");
    const payload = encrypt(key, plaintext);
    expect(decrypt(key, payload).toString("utf8")).toBe("the quick brown fox");
  });

  it("round-trips JSON, preserving nested structure", () => {
    const value = { creds: { id: 7, nested: { flag: true, list: [1, 2, 3] } } };
    const payload = encryptJson(key, value);
    expect(decryptJson(key, payload)).toEqual(value);
  });

  it("never stores the plaintext in the ciphertext", () => {
    const payload = encrypt(key, Buffer.from("super-secret-credential", "utf8"));
    expect(payload.ciphertext.toString("utf8")).not.toContain("super-secret");
    expect(payload.ciphertext.toString("hex")).not.toBe(Buffer.from("super-secret-credential").toString("hex"));
  });

  it("uses a fresh iv per encryption, so identical inputs differ", () => {
    const first = encrypt(key, Buffer.from("same", "utf8"));
    const second = encrypt(key, Buffer.from("same", "utf8"));
    expect(first.iv.equals(second.iv)).toBe(false);
    expect(first.ciphertext.equals(second.ciphertext)).toBe(false);
  });

  // The authentication half of AES-GCM is the whole reason it was chosen
  // over CBC: a row edited in the database must fail to decrypt, not decrypt
  // into something an attacker chose.
  it("rejects tampered ciphertext", () => {
    const payload = encrypt(key, Buffer.from("do-not-modify", "utf8"));
    const tampered = Buffer.from(payload.ciphertext);
    tampered[0] = (tampered[0]! ^ 0xff) & 0xff;
    expect(() => decrypt(key, { ...payload, ciphertext: tampered })).toThrow(DecryptionError);
  });

  it("rejects a tampered auth tag", () => {
    const payload = encrypt(key, Buffer.from("do-not-modify", "utf8"));
    const tampered = Buffer.from(payload.authTag);
    tampered[0] = (tampered[0]! ^ 0xff) & 0xff;
    expect(() => decrypt(key, { ...payload, authTag: tampered })).toThrow(DecryptionError);
  });

  it("rejects a tampered iv", () => {
    const payload = encrypt(key, Buffer.from("do-not-modify", "utf8"));
    const tampered = Buffer.from(payload.iv);
    tampered[0] = (tampered[0]! ^ 0xff) & 0xff;
    expect(() => decrypt(key, { ...payload, iv: tampered })).toThrow(DecryptionError);
  });

  it("rejects the wrong key", () => {
    const payload = encrypt(key, Buffer.from("do-not-modify", "utf8"));
    expect(() => decrypt(otherKey, payload)).toThrow(DecryptionError);
  });

  // The AAD is what binds a row to its own identity. Without it, a row could
  // be copied from one account to another and would still decrypt cleanly.
  it("rejects a payload decrypted under different additional data", () => {
    const aad = Buffer.from("account-a:creds:default", "utf8");
    const otherAad = Buffer.from("account-b:creds:default", "utf8");
    const payload = encrypt(key, Buffer.from("bound", "utf8"), aad);
    expect(decrypt(key, payload, aad).toString("utf8")).toBe("bound");
    expect(() => decrypt(key, payload, otherAad)).toThrow(DecryptionError);
  });

  it("refuses a key of the wrong length", () => {
    expect(() => encrypt(randomBytes(16), Buffer.from("x"))).toThrow(/must be 32 bytes/);
  });

  it("never leaks which part failed", () => {
    const payload = encrypt(key, Buffer.from("x", "utf8"));
    try {
      decrypt(otherKey, payload);
      expect.unreachable("decrypt should have thrown");
    } catch (error) {
      expect((error as Error).message).toBe("Stored credential failed authentication and cannot be decrypted");
    }
  });

  describe("safeEqual", () => {
    it("matches identical strings", () => {
      expect(safeEqual("token-abc", "token-abc")).toBe(true);
    });

    it("rejects different strings of equal length", () => {
      expect(safeEqual("token-abc", "token-abd")).toBe(false);
    });

    it("rejects strings of different lengths without throwing", () => {
      expect(safeEqual("short", "much-longer-token")).toBe(false);
    });
  });
});
