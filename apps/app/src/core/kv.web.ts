// Web: localStorage, already synchronous (D-060). Blocked storage (private modes) = nothing kept.
/** localStorage needs no loading: always ready, so the web app never waits for it. */
export const kvReady = () => true;

export function hydrateKv(): Promise<void> {
  return Promise.resolve();
}

export function kvGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function kvSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {}
}

export function kvRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {}
}
