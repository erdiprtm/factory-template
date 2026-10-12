import { Text } from "@factory/ui";
import { usePathname, useRouter } from "expo-router";
import { useColorScheme } from "nativewind";
import { Pressable, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import product from "../../../../../product.config";
import { productTabs } from "../../features/nav";
import { useMe } from "../auth/use-me";
import { type MessageKey, useI18n } from "../i18n";
import { isActiveTab, type NavTab, navTabs } from "./tabs";

/** Wide web screens get the top bar; phones and native get the bottom tab bar. */
export const WIDE = 768;

function useTabs(): NavTab<MessageKey>[] {
  const me = useMe();
  return navTabs<MessageKey>(productTabs, {
    isAdmin: Boolean(me.data?.isAdmin),
    home: "nav.home",
    account: "nav.account",
    admin: "nav.admin",
  });
}

/** Top bar: the product name and its tabs as links (wide web). */
export function TopNav() {
  const { t } = useI18n();
  const router = useRouter();
  const path = usePathname();
  return (
    <View role="navigation" className="w-full flex-row items-center justify-between border-b border-border px-4 py-2">
      <Text className="text-base font-bold text-foreground">{product.name}</Text>
      <View className="flex-row">
        {useTabs().map((tab) => {
          const active = isActiveTab(path, tab.href);
          return (
            <Pressable
              key={tab.href}
              role="link"
              accessibilityState={{ selected: active }}
              onPress={() => router.push(tab.href as never)}
              className="min-h-11 justify-center px-3"
            >
              <Text className={active ? "font-semibold text-foreground" : "text-muted-foreground"}>{t(tab.label)}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Bottom tab bar (phones, native): icon above label, 44 px+ targets, above the home indicator. */
export function BottomNav() {
  const { t } = useI18n();
  const router = useRouter();
  const path = usePathname();
  const insets = useSafeAreaInsets();
  // Icons need real colors (native SVG can't read CSS variables): the theme tokens themselves.
  const colors = product.brand.tokens.colors[useColorScheme().colorScheme === "dark" ? "dark" : "light"];
  return (
    <View
      role="tablist"
      className="w-full flex-row border-t border-border bg-card"
      style={{ paddingBottom: Math.max(insets.bottom, 4) }}
    >
      {useTabs().map((tab) => {
        const active = isActiveTab(path, tab.href);
        const Icon = tab.icon;
        return (
          <Pressable
            key={tab.href}
            role="tab"
            accessibilityState={{ selected: active }}
            onPress={() => router.push(tab.href as never)}
            className="min-h-14 flex-1 items-center justify-center gap-0.5 pt-1.5"
          >
            {Icon ? <Icon size={22} color={active ? colors.primary : colors.mutedForeground} /> : null}
            <Text className={`text-xs ${active ? "font-semibold text-primary" : "text-muted-foreground"}`}>
              {t(tab.label)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The signed-in shell's navigation. Without product tabs it's the template's top bar everywhere.
 * With them: top bar on wide web, bottom tabs elsewhere (D-048).
 */
export function useNavPlacement(): "top" | "bottom" {
  const { width } = useWindowDimensions();
  return productTabs.length === 0 || width >= WIDE ? "top" : "bottom";
}
