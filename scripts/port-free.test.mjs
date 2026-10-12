import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT = join(import.meta.dirname, "port-free.mjs");
const check = (port) => spawnSync(process.execPath, [SCRIPT, String(port)], { encoding: "utf8" });

describe("port-free (E2E start-up guard, D-051)", () => {
  it("stops when another server holds the port, as another project's dev server does", async () => {
    // A wildcard socket (:: where IPv6 exists) answering 404, like the server that made E2E time out.
    const other = createServer((_, res) => {
      res.statusCode = 404;
      res.end();
    });
    await new Promise((resolve) => other.listen(0, resolve));
    const { port } = other.address();
    try {
      const r = check(port);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain(`Port ${port} is already in use`);
    } finally {
      await new Promise((resolve) => other.close(resolve));
    }
    expect(check(port).status).toBe(0);
  });
});
