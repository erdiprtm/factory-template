import { Loading } from "@factory/ui";
import { Redirect, Stack, usePathname, useRouter } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";
import { identify } from "../../core/analytics";
import { sendTouch } from "../../core/attribution";
import { anonymousHome, leaveTo } from "../../core/auth/anonymous-home";
import { useMe } from "../../core/auth/use-me";
import { useI18n } from "../../core/i18n";
import { syncMarketingConsent } from "../../core/marketing";
import { setMonitoringUser } from "../../core/monitoring";
import { BottomNav, TopNav, useNavPlacement } from "../../core/nav/product-nav";
import { sendQuiz } from "../../core/quiz/send";
import { takeAfterSignIn } from "../../core/quiz/storage";

/** Protected area: signed-in users with all required consents. Paid features add requireAccess. */
export default function ProtectedLayout() {
  const me = useMe();
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const placement = useNavPlacement();
  const userId = me.data?.user?.id;
  const ready = Boolean(userId) && me.data?.missingConsents.length === 0;
  useEffect(() => {
    // Placement "after_quiz": the quiz asked to open the paywall once signed in (D-037).
    const next = ready && !me.data?.access ? takeAfterSignIn() : null;
    if (next) router.replace(next);
  }, [ready, me.data?.access, router]);
  const marketingConsent = me.data?.marketingConsent ?? false;
  useEffect(() => {
    if (userId) void syncMarketingConsent(marketingConsent);
  }, [userId, marketingConsent]);
  useEffect(() => {
    if (userId) identify(userId);
    if (userId) setMonitoringUser(userId);
    if (userId) void sendTouch(userId);
    if (userId) void sendQuiz(); // the protected area renders only after consent
  }, [userId]);
  // One domain (D-068): a signed-out visitor at "/" goes to the site's landing page, not sign-in.
  const landing = !me.isPending && !me.data?.user ? anonymousHome(pathname) : null;
  useEffect(() => {
    if (landing) leaveTo(landing, true);
  }, [landing]);
  if (me.isPending || landing) return <Loading label={t("common.loading")} />;
  if (!me.data?.user) return <Redirect href="/sign-in" />;
  if (me.data.missingConsents.length > 0) return <Redirect href="/consent" />;
  return (
    <View className="flex-1 bg-background">
      {placement === "top" ? <TopNav /> : null}
      <View className="flex-1">
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "transparent" } }} />
      </View>
      {placement === "bottom" ? <BottomNav /> : null}
    </View>
  );
}
