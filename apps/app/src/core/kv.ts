import AsyncStorage from "@react-native-async-storage/async-storage";

// Native key-value storage that survives app restarts (D-060), read synchronously like the web's
// localStorage: AsyncStorage is loaded into a cache once at start (the root layout waits for
// hydrateKv), reads come from the cache, writes go to both. Products may use it too (drafts).
const cache = new Map<string, string>();
let hydrated: Promise<void> | null = null;
let ready = false;

/** Whether hydrateKv has finished (reads before that see an empty store). */
export const kvReady = () => ready;

/** Loads every stored key once. Never throws: storage trouble means starting empty, as before. */
export function hydrateKv(): Promise<void> {
  hydrated ??= (async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      for (const [k, v] of await AsyncStorage.multiGet(keys)) if (v !== null) cache.set(k, v);
    } catch {}
    ready = true;
  })();
  return hydrated;
}

export function kvGet(key: string): string | null {
  return cache.get(key) ?? null;
}

export function kvSet(key: string, value: string): void {
  cache.set(key, value);
  void AsyncStorage.setItem(key, value).catch(() => {});
}

/** Removes every key but `keep` (account deletion, D-106), from the cache and from storage. */
export function kvClearExcept(keep: readonly string[]): void {
  for (const key of [...cache.keys()]) if (!keep.includes(key)) cache.delete(key);
  void AsyncStorage.getAllKeys()
    .then((keys) => AsyncStorage.multiRemove(keys.filter((k) => !keep.includes(k))))
    .catch(() => {});
}

export function kvRemove(key: string): void {
  cache.delete(key);
  void AsyncStorage.removeItem(key).catch(() => {});
}
