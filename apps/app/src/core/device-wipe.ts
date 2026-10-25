// Native: after an account deletion, nothing of the person stays on the device (D-105, UU PDP).
import { onDeviceWipe } from "../features/device-data";
import { forgetTouch } from "./attribution";
import { kvClearExcept } from "./kv";

/** Kept across a wipe: display choices, no personal data. */
export const WIPE_KEEP = ["theme", "locale"] as const;

/** The product's own storage first, then every kv key but the display choices. */
export async function wipeDevice(): Promise<void> {
  try {
    await onDeviceWipe();
  } catch {}
  kvClearExcept(WIPE_KEEP);
  forgetTouch();
}

/** Where the person lands after the wipe: sign-in, as a stranger. */
export function leaveAfterWipe(go: (path: "/sign-in") => void): void {
  go("/sign-in");
}
