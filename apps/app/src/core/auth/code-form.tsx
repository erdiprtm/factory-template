import { Button, ErrorText, Input, Text } from "@factory/ui";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { useI18n } from "../i18n";

/** Seconds before "Kirim ulang" works again; Better Auth also limits sends per IP and core per address. */
export const RESEND_SECONDS = 30;

/** Keeps the digits of whatever was typed or pasted ("482 913", "Kode: 482913"), at most 6. */
export const codeDigits = (v: string) => v.replace(/\D/g, "").slice(0, 6);

/**
 * The 6-digit code from the sign-in email (D-079), shown on "Cek email kamu". Signs in in THIS
 * browser, for someone who opened the link in another app. `signIn` resolves to null on success
 * (the screen then follows /api/me like the link does), or the error code.
 */
export function CodeForm({
  email,
  signIn,
  resend,
  changeEmail,
}: {
  email: string;
  signIn: (code: string) => Promise<string | null>;
  resend: () => Promise<boolean>;
  changeEmail: () => void;
}) {
  const { t } = useI18n();
  const [code, setCode] = useState("");
  const [state, setState] = useState<"idle" | "checking" | "wrong" | "locked" | "resent">("idle");
  const [wait, setWait] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  async function submit(value = code) {
    if (value.length !== 6 || state === "checking") return;
    setState("checking");
    const error = await signIn(value);
    if (error === null) return;
    setState(error === "TOO_MANY_ATTEMPTS" ? "locked" : "wrong");
  }

  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap items-center gap-x-2">
        <Text variant="muted">{`${t("auth.signIn.sentTo")} ${email}`}</Text>
        <Pressable role="button" onPress={changeEmail} className="min-h-11 justify-center" testID="change-email">
          <Text className="font-semibold text-primary">{t("auth.signIn.changeEmail")}</Text>
        </Pressable>
      </View>
      <Input
        testID="sign-in-code"
        accessibilityLabel={t("auth.signIn.codeLabel")}
        placeholder="000000"
        inputMode="numeric"
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={6}
        className="text-center text-2xl tracking-widest"
        value={code}
        onChangeText={(v) => {
          const digits = codeDigits(v);
          setCode(digits);
          if (state === "wrong") setState("idle");
          // A full paste or the keyboard's suggestion signs in at once.
          if (digits.length === 6 && v.length >= 6) void submit(digits);
        }}
        onSubmitEditing={() => void submit()}
      />
      {state === "wrong" ? <ErrorText>{t("auth.signIn.codeWrong")}</ErrorText> : null}
      {state === "locked" ? <ErrorText>{t("auth.signIn.codeLocked")}</ErrorText> : null}
      {state === "resent" ? <Text variant="muted">{t("auth.signIn.resent")}</Text> : null}
      <Button
        testID="sign-in-code-submit"
        onPress={() => void submit()}
        disabled={code.length !== 6 || state === "checking"}
      >
        <Text>{state === "checking" ? t("auth.signIn.checking") : t("auth.signIn.useCode")}</Text>
      </Button>
      <Button
        variant="ghost"
        testID="resend-code"
        disabled={wait > 0}
        onPress={async () => {
          if (wait > 0) return;
          setWait(RESEND_SECONDS);
          setCode("");
          setState((await resend()) ? "resent" : "idle");
        }}
      >
        <Text>
          {wait > 0 ? `${t("auth.signIn.resendIn")} ${wait} ${t("auth.signIn.seconds")}` : t("auth.signIn.resend")}
        </Text>
      </Button>
    </View>
  );
}
