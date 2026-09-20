import { BufferJSON, initAuthCreds, proto } from "baileys";
import type { AuthenticationCreds, AuthenticationState, SignalDataTypeMap } from "baileys";
import { CREDS_CATEGORY, CREDS_KEY_ID, type AuthStateRepository } from "./auth-state.repository.js";

// A Baileys AuthenticationState backed by AuthStateRepository, modelled on
// the library's own useMultiFileAuthState but writing encrypted rows instead
// of files on disk.
//
// Values pass through BufferJSON, the same replacer/reviver Baileys uses for
// its file store: the credential objects contain raw Buffers (key pairs,
// signatures) which plain JSON.stringify would flatten into an unusable
// `{type:"Buffer",data:[...]}`-adjacent shape on the way back out.

export type PersistentAuthState = {
  state: AuthenticationState;
  /** Persists the mutated creds object. Called on every `creds.update`. */
  saveCreds: () => Promise<void>;
  /** True when this account had no stored credentials — a first link. */
  isFresh: boolean;
};

function serialize(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, BufferJSON.replacer));
}

function deserialize<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value), BufferJSON.reviver) as T;
}

export async function usePostgresAuthState(repo: AuthStateRepository, accountId: string): Promise<PersistentAuthState> {
  const stored = await repo.get<unknown>(accountId, CREDS_CATEGORY, CREDS_KEY_ID);
  const isFresh = stored === null;
  const creds: AuthenticationCreds = isFresh ? initAuthCreds() : deserialize<AuthenticationCreds>(stored);

  return {
    isFresh,
    state: {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
          const rows = await repo.getMany<unknown>(accountId, type, ids);
          const data: { [id: string]: SignalDataTypeMap[T] } = {};
          for (const id of ids) {
            const raw = rows[id];
            if (raw === undefined) continue;
            let value = deserialize<SignalDataTypeMap[T]>(raw);
            // Baileys needs this one category rehydrated into its protobuf
            // wrapper, not a plain object — same special case its own file
            // store makes.
            if (type === "app-state-sync-key" && value) {
              // Double cast: TypeScript cannot narrow SignalDataTypeMap[T]
              // from the runtime check on `type`, so the generic parameter
              // is still the full union here.
              value = proto.Message.AppStateSyncKeyData.fromObject(value as object) as unknown as SignalDataTypeMap[T];
            }
            data[id] = value;
          }
          return data;
        },
        set: async (data) => {
          const writes: Promise<void>[] = [];
          for (const category of Object.keys(data)) {
            const entries = data[category as keyof typeof data];
            if (!entries) continue;
            for (const [keyId, value] of Object.entries(entries)) {
              // Baileys signals deletion by setting the value to null.
              writes.push(
                value === null || value === undefined
                  ? repo.remove(accountId, category, keyId)
                  : repo.set(accountId, category, keyId, serialize(value)),
              );
            }
          }
          await Promise.all(writes);
        },
      },
    },
    saveCreds: async () => {
      await repo.set(accountId, CREDS_CATEGORY, CREDS_KEY_ID, serialize(creds));
    },
  };
}
