import { Button, Card, CardContent, CardTitle, ErrorText, Input, Loading, Screen, Text } from "@factory/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import { slots } from "../../features/slots";
import { DashboardSection } from "../admin/dashboard";
import { EconomicsSection } from "../admin/economics";
import { api } from "../api";
import { useMe } from "../auth/use-me";
import { formatDate, formatIdr } from "../format";
import { type MessageKey, useI18n } from "../i18n";

// Per-product admin (Phase 7). The API enforces the allowlist; this screen only renders.
export function Admin() {
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
  const Panel = slots.adminPanel;

  return (
    <Screen className="max-w-3xl">
      <Text variant="h1">{t("admin.title")}</Text>
      {/* The monitoring dashboard first (D-113); the details and tools below. */}
      <DashboardSection />
      {s ? (
        <View className="flex-row flex-wrap gap-3">
          <Metric label={t("admin.users")} value={s.users} />
          <Metric label={t("admin.active")} value={s.activeUsers} />
          <Metric label={t("admin.trial")} value={s.activeBySource.trial} />
          <Metric label={t("admin.paid")} value={s.activeBySource.paid} />
          <Metric label={t("admin.granted")} value={s.activeBySource.admin_grant} />
        </View>
      ) : null}

      <EconomicsSection />

      {/* The product's own admin section (D-100); only reached past the admin check above. */}
      {Panel ? <Panel t={t} locale={locale} /> : null}

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
      <DeleteUserForm />

      <Card>
        <CardTitle>{t("admin.payments")}</CardTitle>
        <CardContent>
          <Text variant="muted">{t("admin.refundHint")}</Text>
          {payments.data?.payments.map((p) => (
            <View key={p.id} className="gap-1">
              <Row
                left={`${p.email} · ${p.planId}`}
                sub={formatDate(p.createdAt, locale)}
                right={`${formatIdr(p.amountIdr)} · ${t(`account.status.${p.status}` as MessageKey)}`}
              />
              {p.status === "paid" ? <RefundButton paymentId={p.id} /> : null}
            </View>
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

/** D-110: delete someone's account on their request, or a test account. The email is typed twice. */
function DeleteUserForm() {
  const { t } = useI18n();
  const client = useQueryClient();
  const [email, setEmail] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const same = email.trim() !== "" && email.trim().toLowerCase() === confirm.trim().toLowerCase();

  async function remove() {
    setBusy(true);
    const res = await api.api.admin["delete-user"].$post({ json: { email: email.trim(), confirm: confirm.trim() } });
    setBusy(false);
    if (res.status === 404) return setMessage({ ok: false, text: t("admin.grantNotFound") });
    if (res.status === 409) return setMessage({ ok: false, text: t("admin.deleteUserAdmin") });
    if (!res.ok) return setMessage({ ok: false, text: t("common.error") });
    setMessage({ ok: true, text: t("admin.deleteUserDone") });
    setEmail("");
    setConfirm("");
    client.invalidateQueries({ queryKey: ["admin-stats"] });
  }

  return (
    <Card>
      <CardTitle>{t("admin.deleteUser")}</CardTitle>
      <CardContent>
        <Text variant="muted">{t("admin.deleteUserHint")}</Text>
        <Input
          accessibilityLabel={t("admin.deleteUserEmail")}
          placeholder={t("admin.deleteUserEmail")}
          autoCapitalize="none"
          inputMode="email"
          value={email}
          onChangeText={setEmail}
        />
        <Input
          accessibilityLabel={t("admin.deleteUserConfirm")}
          placeholder={t("admin.deleteUserConfirm")}
          autoCapitalize="none"
          inputMode="email"
          value={confirm}
          onChangeText={setConfirm}
        />
        <Button variant="destructive" onPress={remove} disabled={!same || busy} testID="admin-delete-user">
          <Text>{t("admin.deleteUserButton")}</Text>
        </Button>
        {message ? message.ok ? <Text>{message.text}</Text> : <ErrorText>{message.text}</ErrorText> : null}
      </CardContent>
    </Card>
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

/** After refunding in the provider's dashboard: two taps (confirm), then access ends (D-038). */
function RefundButton({ paymentId }: { paymentId: string }) {
  const { t } = useI18n();
  const client = useQueryClient();
  const [armed, setArmed] = useState(false);
  async function refund() {
    if (!armed) return setArmed(true);
    await api.api.admin.refund.$post({ json: { paymentId } });
    setArmed(false);
    void client.invalidateQueries();
  }
  return (
    <Button variant={armed ? "destructive" : "ghost"} onPress={refund} className="self-end">
      <Text>{t(armed ? "admin.refundConfirm" : "admin.refund")}</Text>
    </Button>
  );
}
