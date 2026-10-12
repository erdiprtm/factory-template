// Stops E2E before it starts a server on a port something else already holds (D-051).
// `wrangler dev` doesn't notice: workerd binds 127.0.0.1 and ::1 next to the other process's
// wildcard socket and says Ready, but Playwright's health check keeps its first keep-alive
// connection to the other server and times out after webServer.timeout.
//
// Usage: node scripts/port-free.mjs <port>  (e2e/playwright.config.ts runs it)
import { connect } from "node:net";

const port = Number(process.argv[2]);

/** True when something accepts connections on host:port. */
const listening = (host) =>
  new Promise((resolve) => {
    const socket = connect({ host, port, timeout: 1000 });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });

const taken = (await Promise.all(["127.0.0.1", "::1"].map(listening))).some(Boolean);
if (taken) {
  console.error(
    `Port ${port} is already in use. E2E starts its own wrangler dev there, so a leftover one from an earlier run or another project's server would answer instead.\nFind it: lsof -nP -iTCP:${port} -sTCP:LISTEN`,
  );
  process.exit(1);
}
