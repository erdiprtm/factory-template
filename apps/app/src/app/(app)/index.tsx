import { useQuery } from "@tanstack/react-query";
import { Text } from "react-native";
import { fetchHealth } from "../../core/api";
import { authClient } from "../../core/auth/client";
import { useMe, useRefreshMe } from "../../core/auth/use-me";
import { t } from "../../core/i18n";
import { Button, Screen, styles } from "../../core/ui";

export default function Home() {
  const me = useMe();
  const refresh = useRefreshMe();
  const health = useQuery({ queryKey: ["health"], queryFn: fetchHealth });

  let status = t("health.checking");
  if (health.isSuccess) status = t("health.ok");
  if (health.isError) status = t("health.error");

  return (
    <Screen>
      <Text role="heading" style={styles.title}>
        {t("home.title")}
      </Text>
      <Text style={styles.body}>
        {t("home.signedInAs")} {me.data?.user?.email}
      </Text>
      <Text accessibilityLiveRegion="polite" style={styles.meta}>
        {status}
        {health.data ? ` · ${t("health.version")} ${health.data.commit.slice(0, 7)}` : ""}
      </Text>
      <Button
        variant="ghost"
        label={t("auth.signOut")}
        onPress={async () => {
          await authClient.signOut();
          await refresh();
        }}
      />
    </Screen>
  );
}
