import { Button, Card, CardDescription, CardHeader, CardTitle, ErrorText, Screen, Text } from "@factory/ui";
import { useState } from "react";
import { api } from "../../core/api";
import { useRefreshMe } from "../../core/auth/use-me";
import { Paywall } from "../../core/billing/paywall";
import { reportFirstResult } from "../../core/billing/placement";
import { UpgradePrompt } from "../../core/billing/upgrade-prompt";
import { useI18n } from "../../core/i18n";

// PRODUCT-OWNED example of the core action (D-037): the first runs are free, the result shows
// first, and the offer sits under it. A 402 (free uses used up) shows the paywall.
// Delete this folder, its route file and the API feature to remove it.
export function ExampleFeatureScreen() {
  const { t } = useI18n();
  const refreshMe = useRefreshMe();
  const [state, setState] = useState<{ result?: string; locked?: string; error?: boolean }>({});
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const res = await api.api.example.run.$post();
      if (res.status === 402) return setState({ locked: ((await res.json()) as { reason?: string }).reason ?? "paid" });
      if (!res.ok) return setState({ error: true });
      setState({ result: (await res.json()).message });
      reportFirstResult();
      await refreshMe(); // free uses left
    } catch {
      // Offline or the request failed: the error text, never an unhandled rejection.
      setState({ error: true });
    } finally {
      setBusy(false);
    }
  }

  if (state.locked) return <Paywall reason={state.locked} />;
  return (
    <Screen>
      <Card>
        <CardHeader>
          <CardTitle>{t("example.title")}</CardTitle>
          {state.result ? <CardDescription>{state.result}</CardDescription> : null}
        </CardHeader>
        <Button onPress={run} disabled={busy}>
          <Text>{busy ? t("common.loading") : t("example.run")}</Text>
        </Button>
      </Card>
      {state.error ? <ErrorText>{t("common.error")}</ErrorText> : null}
      {state.result ? <UpgradePrompt /> : null}
    </Screen>
  );
}
