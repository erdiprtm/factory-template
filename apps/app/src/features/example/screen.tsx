import { useQuery } from "@tanstack/react-query";
import { Text } from "react-native";
import { api } from "../../core/api";
import { Paywall } from "../../core/billing/paywall";
import { t } from "../../core/i18n";
import { Loading, Screen, styles } from "../../core/ui";

// PRODUCT-OWNED example of a paid feature. The API route is behind requireAccess; a 402
// shows the paywall. Delete this folder, its route file and the API feature to remove it.
export function ExampleFeatureScreen() {
  const q = useQuery({
    queryKey: ["example"],
    queryFn: async () => {
      const res = await api.api.example.$get();
      if (res.status === 402) return { locked: true as const };
      if (!res.ok) throw new Error(`example ${res.status}`);
      return { locked: false as const, ...(await res.json()) };
    },
  });
  if (q.isPending) return <Loading />;
  if (q.data?.locked) return <Paywall />;
  return (
    <Screen>
      <Text role="heading" style={styles.title}>
        {t("example.title")}
      </Text>
      <Text style={styles.body}>{q.data && !q.data.locked ? q.data.message : ""}</Text>
    </Screen>
  );
}
