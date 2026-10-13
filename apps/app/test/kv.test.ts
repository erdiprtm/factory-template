import { describe, expect, it, vi } from "vitest";

// D-060: native storage survives restarts. AsyncStorage is mocked as a persistent store; a fresh
// module (a new app start) must see what the previous one wrote.
const disk = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getAllKeys: async () => [...disk.keys()],
    multiGet: async (keys: string[]) => keys.map((k) => [k, disk.get(k) ?? null]),
    setItem: async (k: string, v: string) => void disk.set(k, v),
    removeItem: async (k: string) => void disk.delete(k),
  },
}));

async function freshStart() {
  vi.resetModules();
  // The native files, explicitly (vitest resolves *.web.ts first, like the web build).
  const kv = await import("../src/core/kv.ts");
  const quiz = await import("../src/core/quiz/storage.ts");
  const theme = await import("../src/core/theme-storage.ts");
  const locale = await import("../src/core/i18n/storage.ts");
  return { kv, quiz, theme, locale };
}

describe("native storage (core/kv)", () => {
  it("keeps quiz progress, theme and locale across app restarts", async () => {
    const first = await freshStart();
    await first.kv.hydrateKv();
    first.quiz.saveQuizProgress("q1", { answers: { goal: "focus" } });
    first.theme.saveThemePreference("dark");
    first.locale.saveLocale("en");
    first.quiz.setAfterSignIn("/pricing");
    await new Promise((r) => setTimeout(r, 0));

    const next = await freshStart();
    expect(next.kv.kvReady()).toBe(false);
    await next.kv.hydrateKv();
    expect(next.kv.kvReady()).toBe(true);
    expect(next.quiz.loadQuizProgress("q1")).toEqual({ answers: { goal: "focus" } });
    expect(next.theme.loadThemePreference()).toBe("dark");
    expect(next.locale.loadLocale()).toBe("en");
    expect(next.quiz.takeAfterSignIn()).toBe("/pricing");
    expect(next.quiz.takeAfterSignIn()).toBeNull();
  });

  it("starts empty instead of failing when storage is broken", async () => {
    disk.set("factory.quiz.bad", "{not json");
    const s = await freshStart();
    await s.kv.hydrateKv();
    expect(s.quiz.loadQuizProgress("bad")).toBeNull();
  });
});
