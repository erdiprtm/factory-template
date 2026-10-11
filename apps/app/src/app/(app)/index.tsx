import { Button, Card, CardDescription, CardHeader, CardTitle, Screen, Text } from "@factory/ui";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { fetchHealth } from "../../core/api";
import { useMe } from "../../core/auth/use-me";
import { useI18n } from "../../core/i18n";

// Home: a placeholder for the product's features (src/features).
export default function Home() {
  const { t } = useI18n();
  const me = useMe();
  const router = useRouter();
  const health = useQuery({ queryKey: ["health"], queryFn: fetchHealth });

  let status = t("health.checking");
  if (health.isSuccess) status = t("health.ok");
  if (health.isError) status = t("health.error");

  return (
    <Screen>
      <Text variant="h1">{t("home.title")}</Text>
      <Text variant="lead">
        {t("home.signedInAs")} {me.data?.user?.email}
      </Text>
      <Card>
        <CardHeader>
          <CardTitle>{t("example.title")}</CardTitle>
          <CardDescription>{t("paywall.body")}</CardDescription>
        </CardHeader>
        <Button onPress={() => router.push("/example")}>
          <Text>{t("home.openExample")}</Text>
        </Button>
      </Card>
      <Text variant="small" accessibilityLiveRegion="polite">
        {status}
        {health.data ? ` · ${t("health.version")} ${health.data.commit.slice(0, 7)}` : ""}
      </Text>
    </Screen>
  );
}
