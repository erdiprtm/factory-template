import { Loading, Text } from "@factory/ui";
import { Redirect, Stack, usePathname, useRouter } from "expo-router";
import { useEffect } from "react";
import { Pressable, View } from "react-native";
import product from "../../../../../product.config";
import { identify } from "../../core/analytics";
import { useMe } from "../../core/auth/use-me";
import { useI18n } from "../../core/i18n";
import { setMonitoringUser } from "../../core/monitoring";

/** Protected area: signed-in users with all required consents. Paid features add requireAccess. */
export default function ProtectedLayout() {
  const me = useMe();
  const { t } = useI18n();
  const userId = me.data?.user?.id;
  useEffect(() => {
    if (userId) identify(userId);
    if (userId) setMonitoringUser(userId);
  }, [userId]);
  if (me.isPending) return <Loading label={t("common.loading")} />;
  if (!me.data?.user) return <Redirect href="/sign-in" />;
  if (me.data.missingConsents.length > 0) return <Redirect href="/consent" />;
  return (
    <View className="flex-1 bg-background">
      <TopBar />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "transparent" } }} />
    </View>
  );
}

function TopBar() {
  const { t } = useI18n();
  const router = useRouter();
  const path = usePathname();
  const me = useMe();
  const tab = (href: "/" | "/account" | "/admin", label: string) => {
    const active = href === "/" ? path === "/" : path.startsWith(href);
    return (
      <Pressable
        role="link"
        accessibilityState={{ selected: active }}
        onPress={() => router.push(href)}
        className="min-h-11 justify-center px-3"
      >
        <Text className={active ? "font-semibold text-foreground" : "text-muted-foreground"}>{label}</Text>
      </Pressable>
    );
  };
  return (
    <View role="navigation" className="w-full flex-row items-center justify-between border-b border-border px-4 py-2">
      <Text className="text-base font-bold text-foreground">{product.name}</Text>
      <View className="flex-row">
        {tab("/", t("nav.home"))}
        {tab("/account", t("nav.account"))}
        {me.data?.isAdmin ? tab("/admin", t("nav.admin")) : null}
      </View>
    </View>
  );
}
