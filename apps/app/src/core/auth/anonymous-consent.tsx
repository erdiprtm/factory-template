import { Loading } from "@factory/ui";
import type { ReactNode } from "react";
import { acceptAnonymousConsents } from "../api";
import { useI18n } from "../i18n";
import { ConsentForm } from "./consent-form";
import type { ConsentType } from "./consent-rules";
import { useMe, useRefreshMe } from "./use-me";

/**
 * Consent before signup (D-043). Wrap a PUBLIC screen that processes a visitor's data (the quiz, the
 * product's anonymous entry screen) in it: a visitor who hasn't accepted the required documents on
 * this device sees the checkboxes first. Signed-in users pass straight through (the protected
 * area has its own /consent). The API enforces the same rule (403 consent_required).
 */
export function AnonymousConsentGate({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const me = useMe();
  const refresh = useRefreshMe();

  if (me.isPending) return <Loading label={t("common.loading")} />;
  const needed = (me.data?.user ? [] : (me.data?.missingConsents ?? [])) as ConsentType[];
  if (needed.length === 0) return <>{children}</>;

  return (
    <ConsentForm
      needed={needed}
      where="anonymous"
      testID="anon-consent-continue"
      onAccept={async () => {
        await acceptAnonymousConsents(needed);
        await refresh();
      }}
    />
  );
}
