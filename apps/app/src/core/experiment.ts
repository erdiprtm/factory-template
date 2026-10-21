// The device's A/B arm (D-094). On the web the arm comes from the touch's anonId, so the site, the
// app and the API agree without sending it. Native has no touch yet (Phase 10): a random id kept
// in core/kv makes its arm sticky too (its funnel events aren't recorded yet).

import { isAnonId, newAnonId } from "@factory/core/attribution/touch";
import { activeExperiment, type ExperimentTag, experimentTag } from "@factory/core/experiments";
import product from "../../../../product.config";
import { currentTouch } from "./attribution";
import { kvGet, kvSet } from "./kv";

export const experiment = activeExperiment(product.experiments);

const DEVICE_KEY = "factory.exp.device";

function deviceId(): string {
  const touch = currentTouch();
  if (touch) return touch.anonId;
  const stored = kvGet(DEVICE_KEY);
  if (isAnonId(stored)) return stored;
  const id = newAnonId();
  kvSet(DEVICE_KEY, id);
  return id;
}

/** { experiment, variant } for this device, or null when the product runs no experiment. */
export function currentArm(): ExperimentTag | null {
  return experiment ? experimentTag(experiment, deviceId()) : null;
}
