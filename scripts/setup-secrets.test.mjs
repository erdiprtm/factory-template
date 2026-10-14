import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  parseAllowlist,
  parseArgs,
  parseEnv,
  planSecrets,
  redact,
  setupSecrets,
  sharedEnvPath,
  UsageError,
} from "./setup-secrets.mjs";

// Shared secrets setup (D-066). Values in these tests are fake; the point is they never reach output.
const TOKEN = "cf-token-AAAA1111";
const ACCOUNT = "0123456789abcdef0123456789abcdef";

describe("parseEnv", () => {
  it("reads NAME=value lines, export, comments, quotes and escapes", () => {
    const { values, invalidLines } = parseEnv(
      [
        "# shared infra tokens",
        "",
        `CLOUDFLARE_API_TOKEN=${TOKEN}`,
        "export CLOUDFLARE_ACCOUNT_ID = abc  # account id",
        "SINGLE='a #b \\n'",
        'DOUBLE="line1\\nline2 \\"q\\" \\\\"  # trailing comment',
        "HASH_IN_VALUE=abc#def",
        "EMPTY=",
        "WINDOWS=crlf\r",
      ].join("\n"),
    );
    expect(invalidLines).toEqual([]);
    expect(values).toEqual({
      CLOUDFLARE_API_TOKEN: TOKEN,
      CLOUDFLARE_ACCOUNT_ID: "abc",
      SINGLE: "a #b \\n",
      DOUBLE: 'line1\nline2 "q" \\',
      HASH_IN_VALUE: "abc#def",
      EMPTY: "",
      WINDOWS: "crlf",
    });
  });

  it("keeps the last value of a repeated name", () => {
    expect(parseEnv("A=1\nA=2").values).toEqual({ A: "2" });
  });

  it("reports bad lines by number only, never their text", () => {
    const { values, invalidLines } = parseEnv(`OK=1\n${TOKEN}\n1BAD=x\nQ="unclosed\nR='x' junk\nS=2`);
    expect(values).toEqual({ OK: "1", S: "2" });
    expect(invalidLines).toEqual([2, 3, 4, 5]);
  });
});

describe("parseAllowlist", () => {
  it("returns the committed allowlist", () => {
    const names = parseAllowlist(readFileSync(new URL("../factory.secrets.json", import.meta.url), "utf8"));
    expect(names).toEqual(["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"]);
  });

  it.each([
    ["not JSON", "{", /not valid JSON/],
    ["not an array", '{"a":1}', /JSON array/],
    ["a non-string", '["A", 1]', /JSON array/],
    ["a bad name", '["BAD-NAME"]', /BAD-NAME/],
    ["a GITHUB_ name", '["GITHUB_TOKEN"]', /GITHUB_TOKEN/],
    ["a duplicate", '["A","B","A"]', /listed twice: A/],
  ])("rejects %s", (_, text, message) => {
    expect(() => parseAllowlist(text)).toThrow(message);
  });
});

describe("parseArgs", () => {
  it("defaults to the current repo, a real run, every allowlisted name", () => {
    expect(parseArgs([])).toEqual({ repo: null, dryRun: false, only: null, help: false });
  });

  it("reads --repo, --dry-run and --only (both spellings), ignoring pnpm's leading --", () => {
    expect(parseArgs(["--", "--repo", "erdiprtm/myna-fit", "--dry-run", "--only", "A, B,,A"])).toEqual({
      repo: "erdiprtm/myna-fit",
      dryRun: true,
      only: ["A", "B"],
      help: false,
    });
    expect(parseArgs(["--repo=o/r", "--only=A"])).toMatchObject({ repo: "o/r", only: ["A"] });
    expect(parseArgs(["-h"]).help).toBe(true);
  });

  it.each([
    [["--repo"], /--repo needs a value/],
    [["--repo", "--dry-run"], /--repo needs a value/],
    [["--repo", "not-a-repo"], /owner\/name/],
    [["--only", ","], /at least one name/],
    [["--dry-run=yes"], /Unknown argument/],
    [["--force"], /Unknown argument/],
    [["myna-fit"], /Unknown argument/],
  ])("rejects %j", (argv, message) => {
    expect(() => parseArgs(argv)).toThrow(UsageError);
    expect(() => parseArgs(argv)).toThrow(message);
  });
});

describe("planSecrets", () => {
  const allowlist = ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "SENTRY_AUTH_TOKEN"];

  it("sets only allowlisted names, even when .env.shared has more", () => {
    const values = { CLOUDFLARE_API_TOKEN: TOKEN, CLOUDFLARE_ACCOUNT_ID: ACCOUNT, DUITKU_API_KEY: "x", OTHER: "y" };
    expect(planSecrets({ allowlist, values })).toEqual({
      toSet: ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"],
      missing: ["SENTRY_AUTH_TOKEN"],
      skipped: [],
      ignored: 2,
    });
  });

  it("counts an empty value as missing", () => {
    const plan = planSecrets({ allowlist: ["A"], values: { A: "" } });
    expect(plan.missing).toEqual(["A"]);
    expect(plan.toSet).toEqual([]);
  });

  it("with --only, selects a subset in allowlist order and skips the rest", () => {
    const plan = planSecrets({ allowlist, values: {}, only: ["SENTRY_AUTH_TOKEN", "CLOUDFLARE_API_TOKEN"] });
    expect(plan).toMatchObject({
      missing: ["CLOUDFLARE_API_TOKEN", "SENTRY_AUTH_TOKEN"],
      skipped: ["CLOUDFLARE_ACCOUNT_ID"],
    });
  });

  it("refuses --only names outside the allowlist", () => {
    expect(() => planSecrets({ allowlist, values: { DUITKU_API_KEY: "x" }, only: ["DUITKU_API_KEY"] })).toThrow(
      /not in factory.secrets.json: DUITKU_API_KEY/,
    );
  });
});

describe("redact", () => {
  it("removes secret values from text", () => {
    expect(redact(`bad token ${TOKEN}!`, { A: TOKEN, B: "" })).toBe("bad token ***!");
  });
});

describe("sharedEnvPath", () => {
  it("lives in the home folder, outside any repo", () => {
    expect(sharedEnvPath("/home/me")).toBe("/home/me/.config/factory/.env.shared");
  });
});

describe("setupSecrets (gh mocked)", () => {
  let dir;
  let repoRoot;
  let envPath;
  let out;
  let calls;

  /** A fake gh: records every call; `fail` maps a call's first words to a failing result. */
  const fakeGh =
    (fail = {}) =>
    (args, opts = {}) => {
      calls.push({ args, input: opts.input });
      const key = Object.keys(fail).find((k) => args.join(" ").startsWith(k));
      if (key) return fail[key];
      if (args[0] === "repo") return { status: 0, stdout: "erdiprtm/current\n", stderr: "" };
      return { status: 0, stdout: "", stderr: "" };
    };
  const run = (argv, gh = fakeGh()) =>
    setupSecrets(argv, {
      gh,
      envPath,
      repoRoot,
      log: (s) => out.push(s),
      error: (s) => out.push(s),
      platform: "linux",
    });
  const output = () => out.join("\n");
  const secretSets = () => calls.filter((c) => c.args[0] === "secret");
  const writeEnv = (text) => {
    writeFileSync(envPath, text);
    chmodSync(envPath, 0o600);
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "setup-secrets-"));
    repoRoot = join(dir, "repo");
    mkdirSync(repoRoot);
    writeFileSync(join(repoRoot, "factory.secrets.json"), '["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"]');
    mkdirSync(join(dir, "home", ".config", "factory"), { recursive: true });
    envPath = sharedEnvPath(join(dir, "home"));
    out = [];
    calls = [];
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("sets every allowlisted secret on the current repo, values on stdin only", () => {
    writeEnv(`CLOUDFLARE_API_TOKEN=${TOKEN}\nCLOUDFLARE_ACCOUNT_ID=${ACCOUNT}\nDUITKU_API_KEY=prod-key-9999\n`);
    expect(run([])).toBe(0);
    expect(calls.slice(0, 3).map((c) => c.args.join(" "))).toEqual([
      "--version",
      "auth status",
      "repo view --json nameWithOwner --jq .nameWithOwner",
    ]);
    expect(secretSets()).toEqual([
      { args: ["secret", "set", "CLOUDFLARE_API_TOKEN", "--repo", "erdiprtm/current"], input: TOKEN },
      { args: ["secret", "set", "CLOUDFLARE_ACCOUNT_ID", "--repo", "erdiprtm/current"], input: ACCOUNT },
    ]);
    for (const c of calls) expect(c.args.join(" ")).not.toMatch(/cf-token|0123456789abcdef|prod-key/);
    expect(output()).toContain("set: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID");
    expect(output()).toContain("missing: -");
    expect(output()).toContain("1 other name(s)");
    expect(output()).not.toContain("DUITKU_API_KEY"); // names outside the allowlist aren't even listed
    expect(output()).not.toMatch(/cf-token|0123456789abcdef|prod-key/);
  });

  it("--repo targets another repo without asking gh which one this is", () => {
    writeEnv(`CLOUDFLARE_API_TOKEN=${TOKEN}\nCLOUDFLARE_ACCOUNT_ID=${ACCOUNT}`);
    expect(run(["--repo", "erdiprtm/myna-fit"])).toBe(0);
    expect(calls.some((c) => c.args[0] === "repo")).toBe(false);
    expect(secretSets().map((c) => c.args.at(-1))).toEqual(["erdiprtm/myna-fit", "erdiprtm/myna-fit"]);
  });

  it("--dry-run changes nothing and reports what would be set and what is missing", () => {
    writeEnv(`CLOUDFLARE_API_TOKEN=${TOKEN}`);
    expect(run(["--dry-run"])).toBe(1);
    expect(secretSets()).toEqual([]);
    expect(output()).toContain("DRY RUN");
    expect(output()).toContain("would set: CLOUDFLARE_API_TOKEN");
    expect(output()).toContain("missing: CLOUDFLARE_ACCOUNT_ID");
    expect(output()).not.toContain(TOKEN);
  });

  it("--only sets a subset; the others are skipped and don't count as missing", () => {
    writeEnv(`CLOUDFLARE_ACCOUNT_ID=${ACCOUNT}`);
    expect(run(["--only", "CLOUDFLARE_ACCOUNT_ID"])).toBe(0);
    expect(secretSets().map((c) => c.args[2])).toEqual(["CLOUDFLARE_ACCOUNT_ID"]);
    expect(output()).toContain("skipped: CLOUDFLARE_API_TOKEN (not in --only)");
  });

  it("--only with a name outside the allowlist is a usage error and sets nothing", () => {
    writeEnv(`CLOUDFLARE_API_TOKEN=${TOKEN}\nDUITKU_API_KEY=prod-key-9999`);
    expect(run(["--only", "DUITKU_API_KEY"])).toBe(2);
    expect(secretSets()).toEqual([]);
  });

  it("sets what it has, then exits 1 when an allowlisted secret is missing", () => {
    writeEnv(`CLOUDFLARE_API_TOKEN=${TOKEN}\nCLOUDFLARE_ACCOUNT_ID=`);
    expect(run([])).toBe(1);
    expect(secretSets().map((c) => c.args[2])).toEqual(["CLOUDFLARE_API_TOKEN"]);
    expect(output()).toContain("missing: CLOUDFLARE_ACCOUNT_ID (add them to ~/.config/factory/.env.shared)");
  });

  it("reports a failed gh secret set by name, with gh's message redacted", () => {
    writeEnv(`CLOUDFLARE_API_TOKEN=${TOKEN}\nCLOUDFLARE_ACCOUNT_ID=${ACCOUNT}`);
    const gh = fakeGh({
      "secret set CLOUDFLARE_API_TOKEN": { status: 1, stdout: "", stderr: `HTTP 403 echoing ${TOKEN}\nmore` },
    });
    expect(run([], gh)).toBe(1);
    expect(output()).toContain("FAILED     CLOUDFLARE_API_TOKEN: HTTP 403 echoing ***");
    expect(output()).toContain("set: CLOUDFLARE_ACCOUNT_ID");
    expect(output()).toContain("failed: CLOUDFLARE_API_TOKEN");
    expect(output()).not.toContain(TOKEN);
  });

  it("stops before anything else when gh is not installed, saying how to install it", () => {
    writeEnv(`CLOUDFLARE_API_TOKEN=${TOKEN}`);
    const gh = fakeGh({ "--version": { status: null, error: new Error("spawn gh ENOENT") } });
    expect(run([], gh)).toBe(1);
    expect(output()).toContain("gh) is not installed");
    expect(output()).toContain("https://cli.github.com");
    expect(calls.map((c) => c.args[0])).toEqual(["--version"]);
  });

  it("stops when gh is not logged in, saying to run gh auth login", () => {
    writeEnv(`CLOUDFLARE_API_TOKEN=${TOKEN}`);
    expect(run([], fakeGh({ "auth status": { status: 1, stdout: "", stderr: "not logged in" } }))).toBe(1);
    expect(output()).toContain("Fix: gh auth login");
    expect(secretSets()).toEqual([]);
  });

  it("stops when the current folder isn't a GitHub repo, suggesting --repo", () => {
    writeEnv(`CLOUDFLARE_API_TOKEN=${TOKEN}`);
    expect(run([], fakeGh({ "repo view": { status: 1, stdout: "", stderr: "no git remotes" } }))).toBe(1);
    expect(output()).toContain("pass --repo owner/name");
  });

  it("stops when .env.shared doesn't exist, saying how to create it (also on a dry run)", () => {
    expect(run(["--dry-run"])).toBe(1);
    expect(output()).toContain("~/.config/factory/.env.shared does not exist");
    expect(output()).toContain("chmod 600");
    expect(output()).toContain("docs/SECRETS.md");
  });

  it("lists every problem at once", () => {
    expect(run([], fakeGh({ "auth status": { status: 1, stdout: "", stderr: "" } }))).toBe(1);
    expect(output()).toContain("gh auth login");
    expect(output()).toContain("does not exist");
  });

  it("refuses a shared env file inside the repo", () => {
    envPath = join(repoRoot, "shared.env");
    writeEnv(`CLOUDFLARE_API_TOKEN=${TOKEN}`);
    expect(run([])).toBe(1);
    expect(output()).toContain("is inside this repo");
    expect(secretSets()).toEqual([]);
  });

  it("warns when .env.shared is readable by other users", () => {
    writeEnv(`CLOUDFLARE_API_TOKEN=${TOKEN}\nCLOUDFLARE_ACCOUNT_ID=${ACCOUNT}`);
    chmodSync(envPath, 0o644);
    expect(run(["--dry-run"])).toBe(0);
    expect(output()).toContain("Fix: chmod 600");
  });

  it("names bad .env.shared lines by number without printing them", () => {
    writeEnv(`CLOUDFLARE_API_TOKEN=${TOKEN}\nCLOUDFLARE_ACCOUNT_ID=${ACCOUNT}\nnot-a-line ${TOKEN}`);
    expect(run(["--dry-run"])).toBe(0);
    expect(output()).toContain("unreadable line(s) 3");
    expect(output()).not.toContain(TOKEN);
  });

  it("prints usage and exits 2 on a bad flag, before calling gh", () => {
    expect(run(["--force"])).toBe(2);
    expect(output()).toContain("Usage: pnpm setup-secrets");
    expect(calls).toEqual([]);
  });
});

describe("setup-secrets CLI (fake gh on PATH)", () => {
  it("passes values to gh on stdin, and neither argv nor output carries them", () => {
    const dir = mkdtempSync(join(tmpdir(), "setup-secrets-cli-"));
    try {
      const bin = join(dir, "bin");
      const home = join(dir, "home");
      mkdirSync(bin);
      mkdirSync(join(home, ".config", "factory"), { recursive: true });
      const logFile = join(dir, "gh-calls.jsonl");
      // Records argv and stdin of each call, like `gh` would receive them.
      writeFileSync(
        join(bin, "gh"),
        `#!${process.execPath}
const fs = require("node:fs");
const input = process.argv[2] === "secret" ? fs.readFileSync(0, "utf8") : "";
fs.appendFileSync(${JSON.stringify(logFile)}, JSON.stringify({ args: process.argv.slice(2), input }) + "\\n");
`,
      );
      chmodSync(join(bin, "gh"), 0o755);
      const envFile = sharedEnvPath(home);
      writeFileSync(envFile, `CLOUDFLARE_API_TOKEN=${TOKEN}\nCLOUDFLARE_ACCOUNT_ID=${ACCOUNT}\n`);
      chmodSync(envFile, 0o600);

      const r = spawnSync(
        process.execPath,
        [join(import.meta.dirname, "setup-secrets.mjs"), "--repo", "erdiprtm/myna-fit"],
        { encoding: "utf8", env: { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}` } },
      );
      expect(r.status).toBe(0);
      const ghCalls = readFileSync(logFile, "utf8")
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l));
      expect(ghCalls.filter((c) => c.args[0] === "secret")).toEqual([
        { args: ["secret", "set", "CLOUDFLARE_API_TOKEN", "--repo", "erdiprtm/myna-fit"], input: TOKEN },
        { args: ["secret", "set", "CLOUDFLARE_ACCOUNT_ID", "--repo", "erdiprtm/myna-fit"], input: ACCOUNT },
      ]);
      expect(r.stdout + r.stderr).not.toContain(TOKEN);
      expect(r.stdout + r.stderr).not.toContain(ACCOUNT);
      expect(r.stdout).toContain("set: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
