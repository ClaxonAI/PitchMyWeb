import { randomBytes } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { disconnectDb, getDb } from "../db.js";
import { createTestAccount, type TestFixture } from "../testing/helpers.js";
import { DecryptionError } from "./crypto.js";
import { CREDS_CATEGORY, CREDS_KEY_ID, PostgresAuthStateRepository } from "./auth-state.repository.js";

// Against the real Postgres: the upsert semantics, the composite unique key
// and the Bytes round-trip are exactly the things a fake would not tell the
// truth about.

const key = randomBytes(32);
const repo = new PostgresAuthStateRepository(getDb(), key, 1);

const fixtures: TestFixture[] = [];

async function fixture(label: string): Promise<TestFixture> {
  const created = await createTestAccount(label);
  fixtures.push(created);
  return created;
}

afterEach(async () => {
  await Promise.all(fixtures.map((f) => f.cleanup()));
  fixtures.length = 0;
});

afterAll(async () => {
  await disconnectDb();
});

describe("PostgresAuthStateRepository", () => {
  it("returns null for a key that was never stored", async () => {
    const { accountId } = await fixture("missing");
    expect(await repo.get(accountId, CREDS_CATEGORY, CREDS_KEY_ID)).toBeNull();
  });

  it("round-trips a stored value", async () => {
    const { accountId } = await fixture("roundtrip");
    const value = { registrationId: 42, advSecretKey: "abc", nested: { list: [1, 2, 3] } };
    await repo.set(accountId, CREDS_CATEGORY, CREDS_KEY_ID, value);
    expect(await repo.get(accountId, CREDS_CATEGORY, CREDS_KEY_ID)).toEqual(value);
  });

  it("overwrites on a repeated set rather than creating a second row", async () => {
    const { accountId, db } = await fixture("upsert");
    await repo.set(accountId, "session", "device-1", { v: 1 });
    await repo.set(accountId, "session", "device-1", { v: 2 });
    expect(await repo.get(accountId, "session", "device-1")).toEqual({ v: 2 });
    expect(await db.whatsAppAuthKey.count({ where: { accountId } })).toBe(1);
  });

  it("stores ciphertext, never the plaintext", async () => {
    const { accountId, db } = await fixture("ciphertext");
    await repo.set(accountId, CREDS_CATEGORY, CREDS_KEY_ID, { advSecretKey: "super-secret-value" });
    const row = await db.whatsAppAuthKey.findFirstOrThrow({ where: { accountId } });
    expect(Buffer.from(row.ciphertext).toString("utf8")).not.toContain("super-secret-value");
    expect(row.iv.length).toBe(12);
    expect(row.authTag.length).toBe(16);
    expect(row.keyVersion).toBe(1);
  });

  it("fetches many keys of one category at once", async () => {
    const { accountId } = await fixture("getmany");
    await repo.set(accountId, "pre-key", "1", { id: 1 });
    await repo.set(accountId, "pre-key", "2", { id: 2 });
    const result = await repo.getMany(accountId, "pre-key", ["1", "2", "3"]);
    expect(result).toEqual({ "1": { id: 1 }, "2": { id: 2 } });
    // A miss is omitted, not returned as null: the Baileys key store
    // distinguishes "absent" by the key simply not being present.
    expect("3" in result).toBe(false);
  });

  it("returns an empty object when asked for no keys", async () => {
    const { accountId } = await fixture("getmany-empty");
    expect(await repo.getMany(accountId, "pre-key", [])).toEqual({});
  });

  it("removes a single key", async () => {
    const { accountId } = await fixture("remove");
    await repo.set(accountId, "session", "device-1", { v: 1 });
    await repo.remove(accountId, "session", "device-1");
    expect(await repo.get(accountId, "session", "device-1")).toBeNull();
  });

  it("treats removing an absent key as a no-op", async () => {
    const { accountId } = await fixture("remove-absent");
    await expect(repo.remove(accountId, "session", "never-existed")).resolves.toBeUndefined();
  });

  it("wipes every key for one account and leaves other accounts alone", async () => {
    const first = await fixture("wipe-a");
    const second = await fixture("wipe-b");
    await repo.set(first.accountId, CREDS_CATEGORY, CREDS_KEY_ID, { v: 1 });
    await repo.set(first.accountId, "pre-key", "1", { v: 1 });
    await repo.set(second.accountId, CREDS_CATEGORY, CREDS_KEY_ID, { v: 2 });

    await repo.removeAll(first.accountId);

    expect(await first.db.whatsAppAuthKey.count({ where: { accountId: first.accountId } })).toBe(0);
    expect(await repo.get(second.accountId, CREDS_CATEGORY, CREDS_KEY_ID)).toEqual({ v: 2 });
  });

  it("keys of the same id in different categories do not collide", async () => {
    const { accountId } = await fixture("categories");
    await repo.set(accountId, "pre-key", "1", { kind: "pre-key" });
    await repo.set(accountId, "session", "1", { kind: "session" });
    expect(await repo.get(accountId, "pre-key", "1")).toEqual({ kind: "pre-key" });
    expect(await repo.get(accountId, "session", "1")).toEqual({ kind: "session" });
  });

  it("cascades away when the account is deleted", async () => {
    const { accountId, db } = await fixture("cascade");
    await repo.set(accountId, CREDS_CATEGORY, CREDS_KEY_ID, { v: 1 });
    await db.whatsAppAccount.delete({ where: { id: accountId } });
    expect(await db.whatsAppAuthKey.count({ where: { accountId } })).toBe(0);
  });

  // The AAD binds each row to its own account/category/key id. A row moved
  // between accounts in the database must fail to decrypt rather than be
  // silently accepted as that account's credentials.
  it("refuses a row that was moved to another account", async () => {
    const source = await fixture("aad-source");
    const target = await fixture("aad-target");
    await repo.set(source.accountId, CREDS_CATEGORY, CREDS_KEY_ID, { v: "stolen" });
    const row = await source.db.whatsAppAuthKey.findFirstOrThrow({ where: { accountId: source.accountId } });

    await target.db.whatsAppAuthKey.create({
      data: {
        accountId: target.accountId,
        category: CREDS_CATEGORY,
        keyId: CREDS_KEY_ID,
        ciphertext: row.ciphertext,
        iv: row.iv,
        authTag: row.authTag,
        keyVersion: row.keyVersion,
      },
    });

    await expect(repo.get(target.accountId, CREDS_CATEGORY, CREDS_KEY_ID)).rejects.toThrow(DecryptionError);
  });

  it("refuses a row encrypted under a different key", async () => {
    const { accountId } = await fixture("wrong-key");
    await repo.set(accountId, CREDS_CATEGORY, CREDS_KEY_ID, { v: 1 });
    const otherRepo = new PostgresAuthStateRepository(getDb(), randomBytes(32), 1);
    await expect(otherRepo.get(accountId, CREDS_CATEGORY, CREDS_KEY_ID)).rejects.toThrow(DecryptionError);
  });

  it("refuses a row whose ciphertext was edited in the database", async () => {
    const { accountId, db } = await fixture("tampered");
    await repo.set(accountId, CREDS_CATEGORY, CREDS_KEY_ID, { v: 1 });
    const row = await db.whatsAppAuthKey.findFirstOrThrow({ where: { accountId } });
    const tampered = Buffer.from(row.ciphertext);
    tampered[0] = (tampered[0]! ^ 0xff) & 0xff;
    await db.whatsAppAuthKey.update({ where: { id: row.id }, data: { ciphertext: new Uint8Array(tampered) } });

    await expect(repo.get(accountId, CREDS_CATEGORY, CREDS_KEY_ID)).rejects.toThrow(DecryptionError);
  });
});
