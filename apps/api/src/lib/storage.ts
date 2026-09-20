import { ObjectStorage, storageConfigFromEnv } from "@pitchmyweb/storage";

// One lazily created storage client per server process. Returns null when
// STORAGE_* is not configured, so features that need it can answer with a
// clear "not available" instead of crashing at import time.

const globalForStorage = globalThis as unknown as { objectStorage?: ObjectStorage | null };

export function getObjectStorage(): ObjectStorage | null {
  if (globalForStorage.objectStorage === undefined) {
    const config = storageConfigFromEnv();
    globalForStorage.objectStorage = config ? new ObjectStorage(config) : null;
  }
  return globalForStorage.objectStorage;
}

/** Signed download URLs for recordings live this long. */
export const RECORDING_URL_TTL_SECONDS = 60 * 60;
