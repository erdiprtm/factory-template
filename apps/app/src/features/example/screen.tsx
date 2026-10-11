import { Card, CardDescription, CardHeader, CardTitle, Loading, Screen } from "@factory/ui";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../core/api";
import { Paywall } from "../../core/billing/paywall";
import { useI18n } from "../../core/i18n";

// PRODUCT-OWNED example of a paid feature. The API route is behind requireAccess; a 402
// shows the paywall. Delete this folder, its route file and the API feature to remove it.
export function ExampleFeatureScreen() {
  const { t } = useI18n();
  const q = useQuery({
    queryKey: ["example"],
    queryFn: async () => {
      const res = await api.api.example.$get();
      if (res.status === 402) return { locked: true as const };
      if (!res.ok) throw new Error(`example ${res.status}`);
      return { locked: false as const, ...(await res.json()) };
    },
  });
  if (q.isPending) return <Loading label={t("common.loading")} />;
  if (q.data?.locked) return <Paywall />;
  return (
    <Screen>
      <Card>
        <CardHeader>
          <CardTitle>{t("example.title")}</CardTitle>
          <CardDescription>{q.data && !q.data.locked ? q.data.message : ""}</CardDescription>
        </CardHeader>
      </Card>
    </Screen>
  );
}
