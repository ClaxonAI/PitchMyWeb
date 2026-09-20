import type { PrismaClient } from "@pitchmyweb/db";
import { decryptJson, encryptJson } from "./crypto.js";

// Storage boundary for the Baileys credential store.
//
// Everything above this interface deals in plain JSON values; everything
// below deals in encrypted bytes. Swapping Postgres for S3 (or anything
// else) means writing one more implementation of AuthStateRepository and
// changing the line in main.ts that constructs it — no other file imports
// a storage detail.

/** The top-level credential blob is stored under this category. */
export const CREDS_CATEGORY = "creds";
/** ...with a fixed id, since there is exactly one per account. */
export const CREDS_KEY_ID = "default";

export interface AuthStateRepository {
  /** One stored value, or null when absent. */
  get<T>(accountId: string, category: string, keyId: string): Promise<T | null>;
  /** Several values of one category at once, keyed by id; misses are omitted. */
  getMany<T>(accountId: string, category: string, keyIds: string[]): Promise<Record<string, T>>;
  /** Upserts a value. */
  set(accountId: string, category: string, keyId: string, value: unknown): Promise<void>;
  /** Deletes a single value; a no-op when it is already gone. */
  remove(accountId: string, category: string, keyId: string): Promise<void>;
  /** Wipes every stored key for an account (logout / relink). */
  removeAll(accountId: string): Promise<void>;
}

/**
 * Additional authenticated data binding a ciphertext to its own row. A row
 * moved to another account, category or key id no longer authenticates, so
 * a database-level swap is detected rather than silently accepted.
 */
function aadFor(accountId: string, category: string, keyId: string): Buffer {
  return Buffer.from(`${accountId}:${category}:${keyId}`, "utf8");
}

/**
 * Prisma types a Bytes column as `Uint8Array<ArrayBuffer>`, while Node's
 * crypto returns `Buffer<ArrayBufferLike>` (which might be backed by a
 * SharedArrayBuffer). This narrows it with a copy at the one boundary where
 * the two meet.
 */
function toBytes(buffer: Buffer): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(buffer.byteLength));
  bytes.set(buffer);
  return bytes;
}

export class PostgresAuthStateRepository implements AuthStateRepository {
  constructor(
    private readonly db: PrismaClient,
    private readonly encryptionKey: Buffer,
    private readonly keyVersion: number,
  ) {}

  async get<T>(accountId: string, category: string, keyId: string): Promise<T | null> {
    const row = await this.db.whatsAppAuthKey.findUnique({
      where: { accountId_category_keyId: { accountId, category, keyId } },
    });
    if (!row) return null;
    return decryptJson<T>(
      this.encryptionKey,
      { ciphertext: Buffer.from(row.ciphertext), iv: Buffer.from(row.iv), authTag: Buffer.from(row.authTag) },
      aadFor(accountId, category, keyId),
    );
  }

  async getMany<T>(accountId: string, category: string, keyIds: string[]): Promise<Record<string, T>> {
    if (keyIds.length === 0) return {};
    const rows = await this.db.whatsAppAuthKey.findMany({
      where: { accountId, category, keyId: { in: keyIds } },
    });
    const result: Record<string, T> = {};
    for (const row of rows) {
      result[row.keyId] = decryptJson<T>(
        this.encryptionKey,
        { ciphertext: Buffer.from(row.ciphertext), iv: Buffer.from(row.iv), authTag: Buffer.from(row.authTag) },
        aadFor(accountId, category, row.keyId),
      );
    }
    return result;
  }

  async set(accountId: string, category: string, keyId: string, value: unknown): Promise<void> {
    const payload = encryptJson(this.encryptionKey, value, aadFor(accountId, category, keyId));
    const data = {
      ciphertext: toBytes(payload.ciphertext),
      iv: toBytes(payload.iv),
      authTag: toBytes(payload.authTag),
      keyVersion: this.keyVersion,
    };
    await this.db.whatsAppAuthKey.upsert({
      where: { accountId_category_keyId: { accountId, category, keyId } },
      create: { accountId, category, keyId, ...data },
      update: data,
    });
  }

  async remove(accountId: string, category: string, keyId: string): Promise<void> {
    await this.db.whatsAppAuthKey.deleteMany({ where: { accountId, category, keyId } });
  }

  async removeAll(accountId: string): Promise<void> {
    await this.db.whatsAppAuthKey.deleteMany({ where: { accountId } });
  }
}
