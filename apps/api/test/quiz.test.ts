import { describe, expect, it } from "vitest";
import { get, post, signInWithConsent } from "./helpers";

// Sell engine Module 4 (D-036): quiz answers attach to the user after sign-in.
const uniqueEmail = (tag: string) => `${tag}-${crypto.randomUUID()}@example.com`;

describe("POST /api/quiz", () => {
  it("stores the answers, replaces them on a retake, and exports them", async () => {
    const cookie = await signInWithConsent(uniqueEmail("quiz"));
    const first = {
      quizId: "onboarding-v1",
      answers: { goal: "focus", blockers: ["time"], days: 3 },
      completedAt: Date.now(),
    };
    expect((await post("/api/quiz", cookie, first)).status).toBe(200);
    await post("/api/quiz", cookie, { ...first, answers: { goal: "learn" } });
    const { responses } = await (await get("/api/quiz", cookie)).json<{
      responses: { quizId: string; answers: object }[];
    }>();
    expect(responses).toMatchObject([{ quizId: "onboarding-v1", answers: { goal: "learn" } }]);
    const data = await (await get("/api/account/export", cookie)).json<{ quizResponses: unknown[] }>();
    expect(data.quizResponses).toHaveLength(1);
  });

  it("rejects malformed answers and needs a session", async () => {
    const ok = { quizId: "q", answers: { a: "x" }, completedAt: 1 };
    expect((await post("/api/quiz", null, ok)).status).toBe(401);
    const cookie = await signInWithConsent(uniqueEmail("quiz-bad"));
    for (const bad of [
      { ...ok, quizId: "Bad Id" },
      { ...ok, answers: { a: "x".repeat(101) } },
      { ...ok, answers: { a: { nested: true } } },
      { ...ok, answers: Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`k${i}`, "v"])) },
    ]) {
      expect((await post("/api/quiz", cookie, bad)).status).toBe(400);
    }
  });

  it("is erased with the account", async () => {
    const cookie = await signInWithConsent(uniqueEmail("quiz-del"));
    await post("/api/quiz", cookie, { quizId: "q", answers: { a: "x" }, completedAt: Date.now() });
    expect((await post("/api/account/delete", cookie, { confirm: "HAPUS" })).status).toBe(200);
  });
});
