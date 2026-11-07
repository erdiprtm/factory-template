declare namespace Cloudflare {
  interface Env {
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
  }
}

// Vite's ?raw imports (a test reads a source file's imports, D-125).
declare module "*?raw" {
  const source: string;
  export default source;
}
