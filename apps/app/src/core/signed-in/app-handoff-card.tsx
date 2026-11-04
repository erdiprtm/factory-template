import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, ErrorText, Text } from "@factory/ui";
import { useState } from "react";
import { Linking, Platform, View } from "react-native";
import product from "../../../../../product.config";
import { track } from "../analytics";
import { authClient } from "../auth/client";
import { useI18n } from "../i18n";

/**
 * "Lanjut di aplikasi" on the web's Akun (D-120): the store links the product has, and a code the
 * app signs in with. Web only (a native app is already the app), and only once a store URL is set.
 */
export function AppHandoffCard({ stores = product.native.stores }: { stores?: typeof product.native.stores }) {
  const { t } = useI18n();
  const [code, setCode] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  if (Platform.OS !== "web" || (!stores.play && !stores.appStore)) return null;

  async function showCode() {
    setState("loading");
    const { data, error } = await authClient.$fetch<{ code: string }>("/app-handoff/create", { method: "POST" });
    if (error || !data) return setState("error");
    setCode(data.code);
    setState("idle");
  }

  const open = (store: "play" | "app_store", url: string) => {
    track("app_store_clicked", { store });
    void Linking.openURL(url);
  };

  return (
    <Card testID="app-handoff">
      <CardHeader>
        <CardTitle>{t("account.app.title")}</CardTitle>
        <CardDescription>{t("account.app.body")}</CardDescription>
      </CardHeader>
      <CardContent className="gap-3">
        <View className="flex-row flex-wrap gap-2">
          {stores.play ? (
            <Button variant="outline" onPress={() => open("play", stores.play as string)}>
              <Text>{t("account.app.play")}</Text>
            </Button>
          ) : null}
          {stores.appStore ? (
            <Button variant="outline" onPress={() => open("app_store", stores.appStore as string)}>
              <Text>{t("account.app.appStore")}</Text>
            </Button>
          ) : null}
        </View>
        {code ? (
          <View className="gap-1">
            <Text testID="app-handoff-code" selectable className="font-mono text-2xl font-semibold tracking-widest">
              {`${code.slice(0, 4)} ${code.slice(4)}`}
            </Text>
            <Text variant="muted">{t("account.app.validFor")}</Text>
          </View>
        ) : (
          <Button onPress={showCode} disabled={state === "loading"}>
            <Text>{t("account.app.getCode")}</Text>
          </Button>
        )}
        {state === "error" ? <ErrorText>{t("account.app.error")}</ErrorText> : null}
      </CardContent>
    </Card>
  );
}
