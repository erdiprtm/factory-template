import { Button, Card, Text } from "@factory/ui";
import { useEffect, useRef, useState } from "react";
import { Modal, View } from "react-native";
import product from "../../../../../product.config";
import { track } from "../analytics";
import { useI18n } from "../i18n";
import { copyLink, escapeTarget, openOutside } from "./in-app";
import type { InApp } from "./in-app-rules";

/** After a tap on "Buka di browser": how long before the manual steps show (nothing opened). */
export const ESCAPE_FALLBACK_MS = 1500;

/**
 * Sign-in inside Instagram, Facebook, Threads or TikTok (D-121): offers the visitor's real browser
 * before an email goes out, so the magic link lands where the session, quiz progress and anonId
 * are. One tap opens it (never automatically); if nothing happens, the manual steps and a copy
 * button show. Staying is one tap too, and the 6-digit code still works here.
 */
export function InAppEscape({ inApp, onStay }: { inApp: InApp; onStay: () => void }) {
  const { t } = useI18n();
  const [stage, setStage] = useState<"ask" | "manual" | "copied">("ask");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    track("inapp_escape_shown", { app: inApp.app, os: inApp.os });
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [inApp]);

  function open() {
    track("inapp_escape_tapped", { app: inApp.app, os: inApp.os });
    if (!openOutside(inApp, escapeTarget())) return setStage("manual");
    // Opened: this page is in the background by now. Still here: show the manual way.
    timer.current = setTimeout(() => setStage((s) => (s === "ask" ? "manual" : s)), ESCAPE_FALLBACK_MS);
  }

  async function copy() {
    if (await copyLink(escapeTarget())) setStage("copied");
  }

  function stay() {
    track("inapp_escape_stayed", { app: inApp.app, os: inApp.os, stage });
    onStay();
  }

  return (
    <Modal transparent animationType="fade" onRequestClose={stay}>
      <View className="flex-1 items-center justify-center bg-black/50 p-4">
        <Card accessibilityViewIsModal className="w-full max-w-md gap-4 p-6">
          <Text variant="h3">{t("auth.inApp.title")}</Text>
          <Text>{t("auth.inApp.body")}</Text>
          {stage === "ask" ? (
            <Button testID="inapp-open" onPress={open}>
              <Text>{t("auth.inApp.open")}</Text>
            </Button>
          ) : (
            <View className="gap-3">
              <Text accessibilityLiveRegion="polite" className="rounded-lg bg-accent p-4 text-accent-foreground">
                {stage === "copied" ? t("auth.inApp.copied") : t("auth.inApp.manual")}
              </Text>
              <Button testID="inapp-copy" onPress={copy}>
                <Text>{t("auth.inApp.copy")}</Text>
              </Button>
            </View>
          )}
          <Button testID="inapp-stay" variant="ghost" onPress={stay}>
            <Text>{product.auth.emailCode ? t("auth.inApp.stayCode") : t("auth.inApp.stay")}</Text>
          </Button>
        </Card>
      </View>
    </Modal>
  );
}
