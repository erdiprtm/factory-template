import { type ComponentType, lazy, type ReactNode, Suspense } from "react";

/**
 * A slot component loaded on demand (D-101), for slots.tsx: `planCard: lazySlot(() =>
 * import("./myna/plan-card").then((m) => m.PlanCard))`. Its code leaves the first web bundle, so
 * routes that never show it (e.g. /quiz for a plan card) don't download or boot it. `fallback`
 * shows meanwhile (default: nothing). Keep the slots the first screen needs (quizStep on /quiz)
 * static: lazy-loading them only moves their wait in front of the first paint.
 */
export function lazySlot<P extends object>(
  load: () => Promise<ComponentType<P>>,
  fallback: ReactNode = null,
): ComponentType<P> {
  const Slot = lazy(async () => ({ default: await load() }));
  return function LazySlot(props: P) {
    return (
      <Suspense fallback={fallback}>
        <Slot {...props} />
      </Suspense>
    );
  };
}
