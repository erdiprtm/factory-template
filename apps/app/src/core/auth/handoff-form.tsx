import { Button, ErrorText, Input, Text } from "@factory/ui";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { track } from "../analytics";
import { useI18n } from "../i18n";
import { authClient } from "./client";
import { useRefreshMe } from "./use-me";

/** What the code field keeps: letters and digits, upper case, at most 8 (spaces and dashes dropped). */
export const handoffChars = (v: string) =>
  v
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);

/**
 * Native sign-in with the code shown on the web's "Lanjut di aplikasi" (D-120): someone who
 * already signed in (or paid) on the web lands in the same account without another email.
 */
export function HandoffForm({ initialCode = "" }: { initialCode?: string }) {
  const { t } = useI18n();
  const refreshMe = useRefreshMe();
  const [open, setOpen] = useState(initialCode !== "");
  const [code, setCode] = useState(handoffChars(initialCode));
  const [state, setState] = useState<"idle" | "checking" | "wrong">("idle");

  async function submit() {
    if (code.length !== 8 || state === "checking") return;
    setState("checking");
    const { error } = await authClient.$fetch("/app-handoff/redeem", { method: "POST", body: { code } });
    if (error) return setState("wrong");
    track("app_signed_in", { method: "handoff" });
    await refreshMe();
  }

  if (!open)
    return (
      <Pressable role="button" onPress={() => setOpen(true)} className="min-h-11 justify-center" testID="handoff-open">
        <Text className="text-center font-semibold text-link">{t("auth.handoff.open")}</Text>
      </Pressable>
    );
  return (
    <View className="gap-3">
      <Text variant="muted">{t("auth.handoff.hint")}</Text>
      <Input
        testID="handoff-code"
        accessibilityLabel={t("auth.handoff.label")}
        placeholder="ABCD2345"
        autoCapitalize="characters"
        autoCorrect={false}
        value={code}
        onChangeText={(v) => {
          setCode(handoffChars(v));
          setState("idle");
        }}
        onSubmitEditing={submit}
      />
      {state === "wrong" ? <ErrorText>{t("auth.handoff.wrong")}</ErrorText> : null}
      <Button onPress={submit} disabled={code.length !== 8 || state === "checking"}>
        <Text>{state === "checking" ? t("auth.handoff.checking") : t("auth.handoff.submit")}</Text>
      </Button>
    </View>
  );
}
