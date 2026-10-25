import { Button, Text } from "@factory/ui";
import { useEffect, useState } from "react";
import { View } from "react-native";
import product from "../../../../product.config";
import { track } from "./analytics";
import { useMe } from "./auth/use-me";
import { firstResultSeen } from "./billing/placement";
import { useI18n } from "./i18n";
import { kvGet, kvSet } from "./kv";
import {
  marketingActive,
  marketingChoice,
  onMarketingChange,
  setMarketingChoice,
  syncMarketingConsent,
} from "./marketing";

const consent = product.marketing.consent;
const SHOWN_KEY = "factory.consent.shown";

/** Whether the product's moment to ask has come (D-107): first visit, after the first result, or signed in. */
export function askReached(askAt: typeof consent.askAt, state: { signedIn: boolean; firstResult: boolean }): boolean {
  if (askAt === "after_signup") return state.signedIn;
  if (askAt === "after_first_result") return state.firstResult;
  return true;
}

/**
 * UU PDP: asks for the "iklan/marketing" choice before any Pixel loads (D-034, D-107). Shown only
 * when this build tracks for ads (Pixel ID + production), the device has no choice yet, and the
 * product's moment to ask has come (`marketing.consent.askAt`). Two equal buttons: allowing and
 * declining are one tap each, nothing is pre-selected, and no choice is the same as no. The
 * product's own wording (`marketing.consent.copy`) replaces core's; the rules stay core's. It sits
 * below the screens in the layout (not over them), so it never covers content.
 */
export function MarketingBanner() {
  const { t, locale } = useI18n();
  const me = useMe();
  const signedIn = Boolean(me.data?.user);
  const [state, setState] = useState({ active: false, undecided: false, firstResult: firstResultSeen() });
  useEffect(() => {
    const update = () =>
      void marketingActive().then((active) =>
        setState({ active, undecided: marketingChoice() === null, firstResult: firstResultSeen() }),
      );
    update();
    return onMarketingChange(update);
  }, []);
  const show =
    state.active && state.undecided && askReached(consent.askAt, { signedIn, firstResult: state.firstResult });
  useEffect(() => {
    // Counted once per device (first-party, D-107), so /admin can tell "no choice" from a choice.
    if (!show || kvGet(SHOWN_KEY)) return;
    kvSet(SHOWN_KEY, "1");
    track("consent_shown");
  }, [show]);
  if (!show) return null;

  const own = consent.copy[locale];
  const copy = {
    title: own?.title ?? t("marketing.banner.title"),
    body: own?.body ?? t("marketing.banner.body"),
    allow: own?.allow ?? t("marketing.banner.allow"),
    deny: own?.deny ?? t("marketing.banner.deny"),
  };
  function choose(choice: "granted" | "denied") {
    track(choice === "granted" ? "consent_granted" : "consent_denied");
    setMarketingChoice(choice);
    // Signed in already (askAt "after_signup"): the account records it now, not at the next sign-in.
    if (signedIn) void syncMarketingConsent(me.data?.marketingConsent ?? false);
  }
  return (
    <View role="region" aria-label={copy.title} className="gap-3 border-t border-border bg-card p-4">
      <Text className="font-semibold text-foreground">{copy.title}</Text>
      <Text variant="muted">{copy.body}</Text>
      {/* Equal weight: same variant and size, so neither answer is pushed. */}
      <View className="flex-row gap-3">
        <Button variant="outline" className="flex-1" testID="consent-deny" onPress={() => choose("denied")}>
          <Text>{copy.deny}</Text>
        </Button>
        <Button variant="outline" className="flex-1" testID="consent-allow" onPress={() => choose("granted")}>
          <Text>{copy.allow}</Text>
        </Button>
      </View>
    </View>
  );
}
