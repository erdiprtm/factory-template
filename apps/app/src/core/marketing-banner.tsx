import { Button, Checkbox, Text } from "@factory/ui";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useI18n } from "./i18n";
import { marketingActive, marketingChoice, onMarketingChange, setMarketingChoice } from "./marketing";

/**
 * UU PDP: asks for the "iklan/marketing" choice before any Pixel loads (D-034). Shown only when
 * this build tracks for ads (Pixel ID + production) and the device has no choice yet. The toggle
 * starts off: no choice is the same as no. It sits below the screens in the layout (not over them),
 * so it never covers content such as the Akun page's delete button.
 */
export function MarketingBanner() {
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  const [ads, setAds] = useState(false);
  useEffect(() => {
    const update = () => void marketingActive().then((on) => setShow(on && marketingChoice() === null));
    update();
    return onMarketingChange(update);
  }, []);
  if (!show) return null;
  return (
    <View role="region" aria-label={t("marketing.banner.title")} className="gap-3 border-t border-border bg-card p-4">
      <Text className="font-semibold text-foreground">{t("marketing.banner.title")}</Text>
      <Text variant="muted">{t("marketing.banner.body")}</Text>
      <Checkbox label={t("marketing.banner.toggle")} checked={ads} onCheckedChange={setAds} />
      <Button onPress={() => setMarketingChoice(ads ? "granted" : "denied")}>
        <Text>{t("marketing.banner.save")}</Text>
      </Button>
    </View>
  );
}
