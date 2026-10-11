import { Button, Card, CardContent, CardTitle, ErrorText, Input, Loading, Screen, Text } from "@factory/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import { api } from "../../core/api";
import { useMe } from "../../core/auth/use-me";
import { formatDate, formatIdr } from "../../core/format";
import { type MessageKey, useI18n } from "../../core/i18n";

// Per-product admin (Phase 7). The API enforces the allowlist; this screen only renders.
export default function Admin() {
  const { t, locale } = useI18n();
  const me = useMe();
  const stats = useQuery({
    queryKey: ["admin-stats"],
    enabled: Boolean(me.data?.isAdmin),
    queryFn: async () => {
      const res = await api.api.admin.stats.$get();
      if (!res.ok) throw new Error(`stats ${res.status}`);
      return res.json();
    },
  });
  const payments = useQuery({
    queryKey: ["admin-payments"],
    enabled: Boolean(me.data?.isAdmin),
    queryFn: async () => (await api.api.admin.payments.$get()).json(),
  });
  const webhooks = useQuery({
    queryKey: ["admin-webhooks"],
    enabled: Boolean(me.data?.isAdmin),
    queryFn: async () => (await api.api.admin.webhooks.$get()).json(),
  });

  if (me.isPending) return <Loading label={t("common.loading")} />;
  if (!me.data?.isAdmin) return <ErrorText className="p-5">{t("admin.forbidden")}</ErrorText>;
  if (stats.isPending) return <Loading label={t("common.loading")} />;
  const s = stats.data;

  return (
    <Screen className="max-w-3xl">
      <Text variant="h1">{t("admin.title")}</Text>
      {s ? (
        <View className="flex-row flex-wrap gap-3">
          <Metric label={t("admin.users")} value={s.users} />
          <Metric label={t("admin.active")} value={s.activeUsers} />
          <Metric label={t("admin.trial")} value={s.activeBySource.trial} />
          <Metric label={t("admin.paid")} value={s.activeBySource.paid} />
          <Metric label={t("admin.granted")} value={s.activeBySource.admin_grant} />
        </View>
      ) : null}

      <Card>
        <CardTitle>{t("admin.revenue")}</CardTitle>
        <CardContent>
          {s?.revenueByMonth.length ? (
            s.revenueByMonth.map((m) => (
              <Row key={m.month} left={m.month} right={`${formatIdr(m.amountIdr)} · ${m.count}×`} />
            ))
          ) : (
            <Text variant="muted">{t("admin.noRevenue")}</Text>
          )}
        </CardContent>
      </Card>

      <GrantForm />

      <Card>
        <CardTitle>{t("admin.payments")}</CardTitle>
        <CardContent>
          {payments.data?.payments.map((p) => (
            <Row
              key={p.id}
              left={`${p.email} · ${p.planId}`}
              sub={formatDate(p.createdAt, locale)}
              right={`${formatIdr(p.amountIdr)} · ${t(`account.status.${p.status}` as MessageKey)}`}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardTitle>{t("admin.webhooks")}</CardTitle>
        <CardContent>
          {webhooks.data?.events.map((e) => (
            <Row
              key={e.id}
              left={`${e.provider} · ${e.eventKey}`}
              sub={formatDate(e.receivedAt, locale)}
              right={e.status}
            />
          ))}
        </CardContent>
      </Card>
    </Screen>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <View className="min-w-32 flex-1 gap-1 rounded-lg border border-border bg-card p-4">
      <Text variant="muted">{label}</Text>
      <Text className="text-2xl font-bold">{value}</Text>
    </View>
  );
}

function Row({ left, right, sub }: { left: string; right: string; sub?: string }) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <View className="flex-1">
        <Text numberOfLines={1}>{left}</Text>
        {sub ? <Text variant="small">{sub}</Text> : null}
      </View>
      <Text className="text-right">{right}</Text>
    </View>
  );
}

function GrantForm() {
  const { t, locale } = useI18n();
  const client = useQueryClient();
  const [email, setEmail] = useState("");
  const [days, setDays] = useState("30");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function grant() {
    const res = await api.api.admin.grant.$post({ json: { email: email.trim(), days: Number(days) } });
    if (res.status === 404) return setMessage({ ok: false, text: t("admin.grantNotFound") });
    if (!res.ok) return setMessage({ ok: false, text: t("common.error") });
    const body = await res.json();
    setMessage({ ok: true, text: `${t("admin.grantDone")} ${formatDate(body.expiresAt, locale)}` });
    client.invalidateQueries({ queryKey: ["admin-stats"] });
  }

  return (
    <Card>
      <CardTitle>{t("admin.grant")}</CardTitle>
      <CardContent>
        <Input
          accessibilityLabel={t("admin.grantEmail")}
          placeholder={t("admin.grantEmail")}
          autoCapitalize="none"
          inputMode="email"
          value={email}
          onChangeText={setEmail}
        />
        <Input
          accessibilityLabel={t("admin.grantDays")}
          placeholder={t("admin.grantDays")}
          inputMode="numeric"
          value={days}
          onChangeText={setDays}
        />
        <Button onPress={grant} disabled={!email || !Number(days)}>
          <Text>{t("admin.grantButton")}</Text>
        </Button>
        {message ? message.ok ? <Text>{message.text}</Text> : <ErrorText>{message.text}</ErrorText> : null}
      </CardContent>
    </Card>
  );
}
