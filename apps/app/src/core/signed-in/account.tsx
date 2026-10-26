import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
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
import { slots } from "../../features/slots";
import { canDownload, downloadJson } from "../account/download";
import { resetAnalytics, track } from "../analytics";
import { api } from "../api";
import { apiBaseUrl } from "../api-base";
import { anonymousHome, leaveTo } from "../auth/anonymous-home";
import { authClient } from "../auth/client";
import { useMe, useRefreshMe } from "../auth/use-me";
import { leaveAfterWipe, wipeDevice } from "../device-wipe";
import { formatDate, formatIdr } from "../format";
import { type Locale, type MessageKey, useI18n } from "../i18n";
import { setMarketingChoice } from "../marketing";
import { setMonitoringUser } from "../monitoring";
import { InstallAccountLink } from "../pwa/install-card";
import { darkModeEnabled, type ThemePreference, useThemePreference } from "../theme";

export function Account() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const refreshMe = useRefreshMe();
  const me = useMe();

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
  const AccountHeader = slots.accountHeader;

  let status = t("account.inactive");
  if (subscription.active && subscription.expiresAt) {
    const label = subscription.source === "trial" ? t("account.trialActive") : t("account.active");
    status = `${label} ${formatDate(subscription.expiresAt, locale)}`;
  } else if (subscription.expiresAt) {
    status = `${t("account.expired")} ${formatDate(subscription.expiresAt, locale)}`;
  }

  return (
    <Screen>
      {AccountHeader ? (
        <AccountHeader
          title={t("account.title")}
          subtitle={profile.email}
          productName={product.name}
          logo={product.brand.logo}
        />
      ) : (
        <Text variant="h1">{t("account.title")}</Text>
      )}

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
            // One domain: back to the landing page (D-068); elsewhere sign-in, as before.
            const landing = anonymousHome("/");
            if (landing) leaveTo(landing);
            else router.replace("/sign-in");
          }}
        >
          <Text>{t("auth.signOut")}</Text>
        </Button>
        {/* nav.adminTab false (D-111): no Admin tab, so admins get here from Akun. */}
        {!product.nav.adminTab && me.data?.isAdmin ? (
          <Button variant="outline" testID="account-admin" onPress={() => router.push("/admin")}>
            <Text>{t("nav.admin")}</Text>
          </Button>
        ) : null}
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
      {/* "Pasang di HP" (D-080): only where this browser can install the app. */}
      <InstallAccountLink />
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
                // A choice, not an action: the screen's filled button stays its real primary (D-086).
                selected ? "border-primary bg-secondary" : "border-input bg-background",
              )}
            >
              {/* One line, shrinking if needed (D-058): long labels used to wrap at larger control heights. */}
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                className={selected ? "font-semibold text-secondary-foreground" : "text-foreground"}
              >
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Language, and Tampilan (light/dark/system) only when the product has a dark mode (D-076). */
export function Preferences() {
  const { t, locale, setLocale, supported } = useI18n();
  const theme = useThemePreference();
  const [pref, setPref] = useState<ThemePreference>(theme.current);
  // Each language in its own name, short enough for one line in a segment.
  const names: Record<Locale, string> = { id: "Indonesia", en: "English" };
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
        {darkModeEnabled ? (
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
        ) : null}
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
    // UU PDP (D-106): the person asked for their data to be gone, from this device too: quiz answers,
    // attribution, drafts and the product's own storage.
    await wipeDevice();
    await refreshMe();
    leaveAfterWipe((path) => router.replace(path));
  }

  return (
    <Card>
      <CardTitle>{t("account.privacy")}</CardTitle>
      <CardContent>
        {product.marketing.metaPixelId ? <MarketingToggle /> : null}
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

/** UU PDP: the "iklan/marketing" consent can be given or withdrawn at any time (D-034). */
function MarketingToggle() {
  const { t } = useI18n();
  const me = useMe();
  const refreshMe = useRefreshMe();
  const [failed, setFailed] = useState(false);
  async function change(granted: boolean) {
    setFailed(false);
    const res = await api.api.consents.marketing.$post({ json: { granted } });
    if (!res.ok) return setFailed(true);
    setMarketingChoice(granted ? "granted" : "denied", true);
    await refreshMe();
  }
  return (
    <View className="gap-1">
      <Checkbox
        label={t("marketing.banner.toggle")}
        checked={Boolean(me.data?.marketingConsent)}
        onCheckedChange={change}
      />
      <Text variant="muted">{t("account.marketingHint")}</Text>
      {failed ? <ErrorText>{t("common.error")}</ErrorText> : null}
      <Separator />
    </View>
  );
}
