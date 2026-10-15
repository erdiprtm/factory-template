import { describe, expect, it } from "vitest";
import { filesToRetry } from "./vitest-pool-retry.mjs";

const FILE = "/repo/apps/api/test/rate-limit.test.ts";
const startFailed = `
⎯⎯⎯⎯⎯⎯ Unhandled Error ⎯⎯⎯⎯⎯⎯⎯
Error: [vitest-pool]: Failed to start cloudflare-pool worker for test files ${FILE}.
 ❯ Caused by: Error: read ECONNRESET
`;
const summary = (tests, errors = "") => `
 Test Files  1 failed | 26 passed (27)
      Tests  ${tests}
${errors ? `     Errors  ${errors}\n` : ""}   Duration  40.1s
`;

describe("vitest-pool-retry (D-089)", () => {
  it("retries only the file whose worker didn't start with ECONNRESET, when every test passed", () => {
    expect(filesToRetry(`\u001b[31m${startFailed}\u001b[39m${summary("268 passed (268)", "1 error")}`)).toEqual([FILE]);
  });

  it("never retries a failed test, even with an ECONNRESET in the same run", () => {
    expect(filesToRetry(`${startFailed} FAIL  test/auth.test.ts > signs in${summary("1 failed | 267 passed")}`)).toBe(
      null,
    );
  });

  it("never retries another error, or a file that failed for another reason", () => {
    expect(filesToRetry(`${startFailed}TypeError: x is undefined${summary("268 passed", "2 errors")}`)).toBe(null);
    expect(filesToRetry(`${startFailed} FAIL  test/auth.test.ts [ test/auth.test.ts ]${summary("268 passed")}`)).toBe(
      null,
    );
  });

  it("never retries a start failure for another reason, or a plain ECONNRESET in a test", () => {
    expect(filesToRetry(startFailed.replace("read ECONNRESET", "spawn ENOENT") + summary("268 passed"))).toBe(null);
    expect(filesToRetry(`Error: read ECONNRESET${summary("1 failed | 267 passed")}`)).toBe(null);
    expect(filesToRetry(summary("268 passed"))).toBe(null);
  });
});
