import { Text } from "@factory/ui";
import { useRouter } from "expo-router";
import { Pressable } from "react-native";
import { leaveTo } from "../auth/anonymous-home";
import { useI18n } from "../i18n";

/**
 * "‹ Kembali" for core screens without a tab bar or other way out (D-124): back in the app's
 * history, else to `leave` (a site page, left with a full page load) or `fallback` (an app path).
 * Renders nothing when there is none of these, so a screen never shows a button that goes nowhere.
 */
export function BackLink({ fallback, leave }: { fallback?: "/" | "/account"; leave?: string | null }) {
  const { t } = useI18n();
  const router = useRouter();
  const canGoBack = router.canGoBack();
  if (!canGoBack && !leave && !fallback) return null;
  return (
    <Pressable
      role="button"
      testID="back-link"
      className="min-h-11 justify-center self-start pr-4"
      onPress={() => {
        if (canGoBack) router.back();
        else if (leave) leaveTo(leave);
        else if (fallback) router.replace(fallback);
      }}
    >
      <Text className="text-muted-foreground">{`‹ ${t("nav.back")}`}</Text>
    </Pressable>
  );
}
