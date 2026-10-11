import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
  ErrorText,
  Input,
  Loading,
  Screen,
  Separator,
  Text,
} from "@factory/ui";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Platform, Pressable, View } from "react-native";
import product from "../../../../../product.config";
import { canDownload, downloadJson } from "../../core/account/download";
import { resetAnalytics, track } from "../../core/analytics";
import { api } from "../../core/api";
import { apiBaseUrl } from "../../core/api-base";
import { authClient } from "../../core/auth/client";
import { useRefreshMe } from "../../core/auth/use-me";
import { formatDate, formatIdr } from "../../core/format";
import { type Locale, type MessageKey, useI18n } from "../../core/i18n";
import { setMonitoringUser } from "../../core/monitoring";
import { type ThemePreference, useThemePreference } from "../../core/theme";

export default function Account() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const refreshMe = useRefreshMe();

  const summary = useQuery({
    queryKey: ["account-summary"],
    queryFn: async () => {
      const res = await api.api.account.summary.$get();
      if (!res.ok) throw new Error(`summary ${res.status}`);
      return res.json();
    },
  });
  const history = useQuery({
    queryKey: ["billing-history"],
    queryFn: async () => {
      const res = await api.api.billing.history.$get();
      if (!res.ok) throw new Error(`history ${res.status}`);
      return res.json();
    },
  });

  if (summary.isPending) return <Loading label={t("common.loading")} />;
  if (!summary.data) return <ErrorText className="p-5">{t("common.error")}</ErrorText>;
  const { profile, subscription } = summary.data;

  let status = t("account.inactive");
  if (subscription.active && subscription.expiresAt) {
    const label = subscription.source === "trial" ? t("account.trialActive") : t("account.active");
    status = `${label} ${formatDate(subscription.expiresAt, locale)}`;
  } else if (subscription.expiresAt) {
    status = `${t("account.expired")} ${formatDate(subscription.expiresAt, locale)}`;
  }

  return (
    <Screen>
      <Text variant="h1">{t("account.title")}</Text>

      <Card>
        <CardHeader>
          <CardTitle>{t("account.profile")}</CardTitle>
          <CardDescription>{profile.email}</CardDescription>
        </CardHeader>
        <Button
          variant="outline"
          onPress={async () => {
            await authClient.signOut();
            resetAnalytics();
            setMonitoringUser(null);
            await refreshMe();
            router.replace("/sign-in");
          }}
        >
          <Text>{t("auth.signOut")}</Text>
        </Button>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("account.subscription")}</CardTitle>
          <Text className={subscription.active ? "text-foreground" : "text-muted-foreground"}>{status}</Text>
        </CardHeader>
        {Platform.OS === "web" ? (
          <Button onPress={() => router.push("/pricing")}>
            <Text>{subscription.active ? t("account.renew") : t("account.subscribe")}</Text>
          </Button>
        ) : (
          <Text variant="muted">{t("pricing.native")}</Text>
        )}
        <Separator />
        <Text variant="h3">{t("account.history")}</Text>
        {history.data?.payments.length ? (
          <View className="gap-2">
            {history.data.payments.map((p) => (
              <View key={p.id} className="flex-row items-center justify-between gap-3">
                <View className="flex-1">
                  <Text>{product.plans.find((pl) => pl.id === p.planId)?.label ?? p.planId}</Text>
                  <Text variant="small">{formatDate(p.createdAt, locale)}</Text>
                </View>
                <View className="items-end">
                  <Text className="font-semibold">{formatIdr(p.amountIdr)}</Text>
                  <Text variant="small">{t(`account.status.${p.status}` as MessageKey)}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <Text variant="muted">{t("account.noPayments")}</Text>
        )}
      </Card>

      <Preferences />
      <Privacy />
    </Screen>
  );
}

function Segmented<T extends string>(props: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <View className="gap-2">
      <Text variant="muted">{props.label}</Text>
      <View role="radiogroup" accessibilityLabel={props.label} className="flex-row gap-2">
        {props.options.map((o) => {
          const selected = o.value === props.value;
          return (
            <Pressable
              key={o.value}
              role="radio"
              aria-checked={selected}
              accessibilityState={{ selected }}
              onPress={() => props.onChange(o.value)}
              className={cn(
                "min-h-11 flex-1 items-center justify-center rounded-lg border px-2",
                selected ? "border-primary bg-primary" : "border-input bg-background",
              )}
            >
              <Text className={selected ? "font-semibold text-primary-foreground" : "text-foreground"}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Preferences() {
  const { t, locale, setLocale, supported } = useI18n();
  const theme = useThemePreference();
  const [pref, setPref] = useState<ThemePreference>(theme.current);
  const names: Record<Locale, string> = { id: "Bahasa Indonesia", en: "English" };
  return (
    <Card>
      <CardTitle>{t("account.preferences")}</CardTitle>
      <CardContent>
        <Segmented
          label={t("account.language")}
          value={locale}
          options={supported.map((l) => ({ value: l, label: names[l] }))}
          onChange={setLocale}
        />
        <Segmented
          label={t("account.theme")}
          value={pref}
          options={[
            { value: "light", label: t("account.theme.light") },
            { value: "dark", label: t("account.theme.dark") },
            { value: "system", label: t("account.theme.system") },
          ]}
          onChange={(v) => {
            setPref(v);
            theme.set(v);
          }}
        />
      </CardContent>
    </Card>
  );
}

function Privacy() {
  const { t } = useI18n();
  const router = useRouter();
  const refreshMe = useRefreshMe();
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function exportData() {
    setError(null);
    try {
      await downloadJson(`${apiBaseUrl()}/api/account/export`, `data-${product.slug}.json`);
    } catch {
      setError(t("common.error"));
    }
  }

  async function deleteAccount() {
    setBusy(true);
    setError(null);
    const res = await api.api.account.delete.$post({ json: { confirm } });
    setBusy(false);
    if (!res.ok) return setError(t("account.deleteError"));
    track("account_deleted");
    resetAnalytics();
    setMonitoringUser(null);
    await refreshMe();
    router.replace("/sign-in");
  }

  return (
    <Card>
      <CardTitle>{t("account.privacy")}</CardTitle>
      <CardContent>
        <Text variant="muted">{canDownload ? t("account.exportHint") : t("account.exportNative")}</Text>
        {canDownload ? (
          <Button variant="outline" onPress={exportData}>
            <Text>{t("account.export")}</Text>
          </Button>
        ) : null}
        <Separator />
        <Text variant="h3">{t("account.delete")}</Text>
        <Text variant="muted">{t("account.deleteHint")}</Text>
        <Input
          accessibilityLabel={t("account.deleteConfirmLabel")}
          placeholder={t("account.deleteConfirmLabel")}
          autoCapitalize="characters"
          value={confirm}
          onChangeText={setConfirm}
        />
        <Button variant="destructive" onPress={deleteAccount} disabled={confirm !== "HAPUS" || busy}>
          <Text>{t("account.deleteButton")}</Text>
        </Button>
        {error ? <ErrorText>{error}</ErrorText> : null}
      </CardContent>
    </Card>
  );
}
