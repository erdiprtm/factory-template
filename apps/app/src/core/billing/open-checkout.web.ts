// Web: go to the provider's hosted payment page in the same tab; it returns to /billing/return.
export function openCheckout(url: string): void {
  window.location.assign(url);
}
