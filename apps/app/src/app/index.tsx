import { useQuery } from "@tanstack/react-query";
import { StyleSheet, Text, View } from "react-native";
import { fetchHealth } from "../core/api";
import { t } from "../core/i18n";

export default function Home() {
  const health = useQuery({ queryKey: ["health"], queryFn: fetchHealth });

  let status = t("health.checking");
  if (health.isSuccess) status = t("health.ok");
  if (health.isError) status = t("health.error");

  return (
    <View style={styles.container}>
      <Text role="heading" style={styles.title}>
        {t("home.title")}
      </Text>
      <Text accessibilityLiveRegion="polite" style={styles.status}>
        {status}
      </Text>
      {health.data ? (
        <Text style={styles.meta}>
          {t("health.version")}: {health.data.commit.slice(0, 7)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 24 },
  title: { fontSize: 28, fontWeight: "700" },
  status: { fontSize: 16 },
  meta: { fontSize: 13, opacity: 0.7 },
});
