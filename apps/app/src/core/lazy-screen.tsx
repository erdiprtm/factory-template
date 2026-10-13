import { Loading } from "@factory/ui";
import { type ComponentType, lazy, Suspense } from "react";
import { useI18n } from "./i18n";

/** A route screen loaded on demand (D-059), with the usual loading state meanwhile. */
export function lazyScreen(load: () => Promise<ComponentType>): ComponentType {
  const Screen = lazy(async () => ({ default: await load() }));
  return function LazyScreen() {
    const { t } = useI18n();
    return (
      <Suspense fallback={<Loading label={t("common.loading")} />}>
        <Screen />
      </Suspense>
    );
  };
}
