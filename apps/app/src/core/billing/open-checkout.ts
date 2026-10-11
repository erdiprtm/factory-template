// Native: web checkout must never be shown or linked inside the app (store rules, Section 6b).
// In-app purchases arrive in Phase 10; until then the native paywall shows no prices or links.
export function openCheckout(_url: string): void {
  throw new Error("Web checkout is not available in native builds");
}
