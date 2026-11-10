import { Button, Card, CardContent, CardTitle, ErrorText, Input, Loading, Screen, Text } from "@factory/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import product from "../../../../../product.config";
import { slots } from "../../features/slots";
import { DashboardSection } from "../admin/dashboard";
import { EconomicsSection } from "../admin/economics";
import { api } from "../api";
import { useMe } from "../auth/use-me";
import { formatDate, formatIdr } from "../format";
import { type MessageKey, useI18n } from "../i18n";
import { BackLink } from "../nav/back-link";

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
      {/* Reached from Akun when there is no Admin tab (D-111): a way back (D-124). */}
      <BackLink fallback="/account" />
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
      {product.notifications.telegram?.commands ? <TelegramCard /> : null}

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
              {p.status === "paid" ? (
                <View className="flex-row flex-wrap justify-end gap-2">
                  <ReceiptButton paymentId={p.id} />
                  <RefundButton paymentId={p.id} />
                </View>
              ) : (
                <RecheckButton paymentId={p.id} />
              )}
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

/** D-114: connect the owner's Telegram bot (webhook + command menu) from the Worker's own secrets. */
function TelegramCard() {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  async function connect() {
    setBusy(true);
    const res = await api.api.admin.telegram.connect.$post();
    setBusy(false);
    const body = (await res.json().catch(() => ({}))) as { missing?: string[]; description?: string | null };
    if (res.ok) return setMessage({ ok: true, text: t("admin.telegramDone") });
    if (body.missing)
      return setMessage({ ok: false, text: `${t("admin.telegramMissing")} ${body.missing.join(", ")}` });
    setMessage({ ok: false, text: `${t("admin.telegramRefused")} ${body.description ?? t("common.error")}` });
  }
  return (
    <Card>
      <CardTitle>{t("admin.telegram")}</CardTitle>
      <CardContent>
        <Text variant="muted">{t("admin.telegramHint")}</Text>
        <Button variant="outline" onPress={connect} disabled={busy} testID="admin-telegram-connect">
          <Text>{t("admin.telegramConnect")}</Text>
        </Button>
        {message ? message.ok ? <Text>{message.text}</Text> : <ErrorText>{message.text}</ErrorText> : null}
      </CardContent>
    </Card>
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

type Covered = { currentExpiry: string | null; adminGrantUntil: string; planLabel: string };

/**
 * D-128: "Cek ulang di provider" for an unpaid payment, settled like its webhook (access, receipt,
 * purchase event, Telegram). If a manual grant made after the payment already gives access, the
 * API asks first: replace that grant with the paid plan, or stack the plan on top.
 */
function RecheckButton({ paymentId }: { paymentId: string }) {
  const { t, locale } = useI18n();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [covered, setCovered] = useState<Covered | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  async function recheck(grantMode?: "replace" | "stack") {
    setBusy(true);
    setMessage(null);
    const res = await api.api.admin.payments.recheck.$post({ json: { paymentId, grantMode } });
    setBusy(false);
    if (res.status === 409) {
      setCovered((await res.json()) as unknown as Covered);
      return;
    }
    setCovered(null);
    if (!res.ok) return setMessage({ ok: false, text: t("common.error") });
    const body = (await res.json()) as { status: string | null; accessUntil: string | null };
    if (body.status === "paid" && body.accessUntil) {
      setMessage({ ok: true, text: `${t("admin.recheckPaid")} ${formatDate(body.accessUntil, locale)}` });
      void client.invalidateQueries();
    } else setMessage({ ok: false, text: t("admin.recheckUnchanged") });
  }
  return (
    <View className="items-end gap-2">
      {covered ? (
        <>
          <Text variant="small" className="text-right">
            {t("admin.recheckCovered")
              .replace("{until}", formatDate(covered.adminGrantUntil, locale))
              .replace("{current}", covered.currentExpiry ? formatDate(covered.currentExpiry, locale) : "-")
              .replace("{plan}", covered.planLabel)}
          </Text>
          <View className="flex-row flex-wrap justify-end gap-2">
            <Button variant="ghost" onPress={() => setCovered(null)} disabled={busy}>
              <Text>{t("common.cancel")}</Text>
            </Button>
            <Button variant="outline" onPress={() => recheck("stack")} disabled={busy} testID="admin-recheck-stack">
              <Text>{t("admin.recheckStack")}</Text>
            </Button>
            <Button onPress={() => recheck("replace")} disabled={busy} testID="admin-recheck-replace">
              <Text>{t("admin.recheckReplace")}</Text>
            </Button>
          </View>
        </>
      ) : (
        <Button variant="ghost" onPress={() => recheck()} disabled={busy} testID="admin-recheck">
          <Text>{t(busy ? "admin.recheckBusy" : "admin.recheck")}</Text>
        </Button>
      )}
      {message ? (
        message.ok ? (
          <Text variant="small">{message.text}</Text>
        ) : (
          <ErrorText>{message.text}</ErrorText>
        )
      ) : null}
    </View>
  );
}

/** D-128: the receipt email of a paid payment again (a buyer who lost it, or a rescued payment). */
function ReceiptButton({ paymentId }: { paymentId: string }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  async function send() {
    setBusy(true);
    const res = await api.api.admin.payments.receipt.$post({ json: { paymentId } });
    setBusy(false);
    setMessage(res.ok ? { ok: true, text: t("admin.receiptDone") } : { ok: false, text: t("common.error") });
  }
  return (
    <View className="items-end">
      <Button variant="ghost" onPress={send} disabled={busy}>
        <Text>{t("admin.receipt")}</Text>
      </Button>
      {message ? (
        message.ok ? (
          <Text variant="small">{message.text}</Text>
        ) : (
          <ErrorText>{message.text}</ErrorText>
        )
      ) : null}
    </View>
  );
}
