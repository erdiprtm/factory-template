import { ErrorText } from "@factory/ui";
import { useState } from "react";
import { View } from "react-native";
import product from "../../../../../product.config";
import { acceptAnonymousConsents } from "../api";
import { useI18n } from "../i18n";
import { ConsentChecks } from "./consent-checks";
import { type ConsentType, canAccept } from "./consent-rules";
import { useMe, useRefreshMe } from "./use-me";

/** Where a visitor consents before signup (D-043, D-074): a screen first, or a row in the quiz. */
export const consentPlacement = product.legal.consentPlacement;

export type InlineConsent = {
  /** Consents this visitor still has to give on this device; [] for signed-in users. */
  needed: ConsentType[];
  /** True while /api/me is loading: what's needed isn't known yet, so the step stays locked. */
  pending: boolean;
  /** True when nothing is needed, or the visitor ticked the box(es). */
  ticked: boolean;
  /** Records the consents on the server (once), before any data leaves the device. */
  accept: () => Promise<boolean>;
  row: React.ReactNode;
};

/**
 * Consent inside a flow instead of a screen before it (D-074): the quiz's first or last question,
 * or a product's entry screen (put `row` above the main action and run the action only after
 * `await accept()` returns true). The checkboxes and links are core's; the server still answers 403
 * consent_required to anything that processes data without the consents.
 */
export function useInlineConsent(): InlineConsent {
  const { t } = useI18n();
  const me = useMe();
  const refresh = useRefreshMe();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [failed, setFailed] = useState(false);
  const pending = me.isPending;
  const needed = (me.data?.user || !me.data ? [] : me.data.missingConsents) as ConsentType[];
  const ticked = !pending && (needed.length === 0 || canAccept(needed, checked));
  return {
    needed,
    pending,
    ticked,
    accept: async () => {
      if (pending) return false;
      if (needed.length === 0) return true;
      if (!canAccept(needed, checked)) return false;
      setFailed(false);
      try {
        await acceptAnonymousConsents(needed);
        await refresh();
        return true;
      } catch {
        setFailed(true);
        return false;
      }
    },
    row:
      needed.length === 0 ? null : (
        <View className="gap-2" testID="inline-consent">
          <ConsentChecks needed={needed} checked={checked} onChange={setChecked} />
          {failed ? <ErrorText>{t("consent.error")}</ErrorText> : null}
        </View>
      ),
  };
}
