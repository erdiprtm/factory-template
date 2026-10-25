// Web: after an account deletion, nothing of the person stays in this browser (D-106, UU PDP):
// localStorage (core's keys, the product's, and the site's when it shares the domain) and
// sessionStorage, keeping only the theme and language choice.
import { onDeviceWipe } from "../features/device-data";
import { forgetTouch } from "./attribution";
import { kvClearExcept } from "./kv";

/** Kept across a wipe: display choices, no personal data. */
export const WIPE_KEEP = ["theme", "locale"] as const;

export async function wipeDevice(): Promise<void> {
  try {
    await onDeviceWipe();
  } catch {}
  kvClearExcept(WIPE_KEEP);
  try {
    window.sessionStorage.clear();
  } catch {}
  forgetTouch();
}

/** A full page load into sign-in, so nothing the page still holds in memory survives either. */
export function leaveAfterWipe(_go: (path: "/sign-in") => void): void {
  window.location.replace("/sign-in");
}
