// The consent rules core keeps for itself, whatever a product's slots render (UU PDP, D-054).
export type ConsentType = "terms" | "privacy" | "sensitive_data";

/** The accept button is enabled only when every required consent is checked. */
export function canAccept(needed: readonly ConsentType[], checked: Readonly<Record<string, boolean>>): boolean {
  return needed.length > 0 && needed.every((c) => checked[c] === true);
}
