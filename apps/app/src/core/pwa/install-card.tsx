// Native: no install offer, the app is installed already (D-080). Web: install-card.web.tsx.
export type InstallPlacement = "payment" | "first_result";

export function InstallOffer(_props: { placement: InstallPlacement; onShownChange?: (shown: boolean) => void }) {
  return null;
}

export function InstallAccountLink() {
  return null;
}
