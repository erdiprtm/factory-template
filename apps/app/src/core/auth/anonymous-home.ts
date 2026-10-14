// Native: there's no "/" page load and no site to go to, so signed-out users always see sign-in.

/** The landing page for a signed-out visitor at `path` (web only, D-068); null = sign-in. */
export function anonymousHome(_path: string): string | null {
  return null;
}

/** Leaves the app for a site page with a full page load (web only). */
export function leaveTo(_url: string, _keepQuery = false): void {}
