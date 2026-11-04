// Web: the browser sends the session cookie itself. Imports nothing, so the first web bundle stays
// free of better-auth's client (D-059); the native file reads the stored cookie (D-120).
export async function sessionHeaders(): Promise<Record<string, string>> {
  return {};
}
