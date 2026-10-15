import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";

// Unmount after every case, and again before each one (D-089): a case that timed out keeps running
// in the background, so its late render can land after its own afterEach. Cleaning up first keeps
// that from failing the next case with "Found multiple elements" instead of the real timeout.
afterEach(() => cleanup());
beforeEach(() => cleanup());
