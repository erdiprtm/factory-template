import { cacTargets } from "@factory/core/economics/metrics";
import { Button, Card, CardContent, CardDescription, CardTitle, cn, ErrorText, Input, Text } from "@factory/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, View } from "react-native";
import product from "../../../../../product.config";
import { api } from "../api";
import { apiBaseUrl } from "../api-base";
import { formatIdr } from "../format";
import { type MessageKey, useI18n } from "../i18n";
import { CsvPicker } from "./csv-picker";

// /admin unit economics (sell engine Module 6, D-038): spend in, CAC/ROAS/LTV and the funnel out.
const DAY = 86_400_000;
const jakartaDay = (ms: number) => new Date(ms + 7 * 3_600_000).toISOString().slice(0, 10);
const pct = (n: number | null) => (n === null ? "–" : `${Math.round(n * 100)}%`);
const idr = (n: number | null) => (n === null ? "–" : formatIdr(n));
const x = (n: number | null) => (n === null ? "–" : `${n.toFixed(2)}×`);

export function EconomicsSection() {
  const { t } = useI18n();
  const [days, setDays] = useState(30);
  const [campaign, setCampaign] = useState<string | null>(null);
  const range = { from: jakartaDay(Date.now() - (days - 1) * DAY), to: jakartaDay(Date.now()) };
  const q = useQuery({
    queryKey: ["admin-economics", days, campaign],
    queryFn: async () => {
      const res = await api.api.admin.economics.$get({ query: { ...range, ...(campaign ? { campaign } : {}) } });
      if (!res.ok) throw new Error(`economics ${res.status}`);
      return res.json();
    },
  });
  const all = useQuery({
    queryKey: ["admin-economics", days, null],
    enabled: campaign !== null,
    queryFn: async () => {
      const res = await api.api.admin.economics.$get({ query: range });
      if (!res.ok) throw new Error(`economics ${res.status}`);
      return res.json();
    },
  });
  const campaigns = (campaign ? all.data : q.data)?.campaigns.filter((c) => c.campaign !== null) ?? [];
  const e = q.data;

  return (
    <View className="gap-4">
      <Text variant="h2">{t("econ.title")}</Text>
      <View className="flex-row flex-wrap gap-2">
        {[7, 30, 90].map((d) => (
          <Chip key={d} active={days === d} label={`${d} ${t("econ.days")}`} onPress={() => setDays(d)} />
        ))}
      </View>
      <View className="flex-row flex-wrap gap-2">
        <Chip active={campaign === null} label={t("econ.allCampaigns")} onPress={() => setCampaign(null)} />
        {campaigns.map((c) => (
          <Chip
            key={c.campaign}
            active={campaign === c.campaign}
            label={c.campaign ?? ""}
            onPress={() => setCampaign(c.campaign)}
          />
        ))}
      </View>
      {e ? (
        <>
          <View className="flex-row flex-wrap gap-3">
            <Metric label={t("econ.spend")} value={idr(e.totals.spendIdr)} />
            <Metric label={t("econ.buyers")} value={String(e.totals.buyers)} />
            <Metric label="CAC" value={idr(e.totals.cacIdr)} />
            <Metric label="ROAS D7" value={x(e.totals.roasD7)} />
            <Metric label="ROAS D30" value={x(e.totals.roasD30)} />
            <Metric label="AOV" value={idr(e.totals.aovIdr)} />
            <Metric label={t("econ.renewal")} value={pct(e.totals.renewalRate)} />
            <Metric label="LTV" value={idr(e.totals.ltvIdr)} />
            <Metric label="LTV − CAC" value={idr(e.totals.ltvMinusCacIdr)} bad={(e.totals.ltvMinusCacIdr ?? 0) < 0} />
          </View>
          <Text variant="muted">{t(campaign ? "econ.campaignNote" : "econ.blendedNote")}</Text>
          <Card>
            <CardTitle>{t("econ.perCampaign")}</CardTitle>
            <CardContent>
              {e.campaigns.length === 0 ? <Text variant="muted">{t("econ.noData")}</Text> : null}
              {e.campaigns.map((c) => (
                <View key={c.campaign ?? "-"} className="gap-0.5 border-b border-border pb-2">
                  <Text className="font-semibold">{c.campaign ?? t("econ.noCampaign")}</Text>
                  <Text variant="small">
                    {`${t("econ.spend")} ${idr(c.spendIdr)} · ${c.buyers} ${t("econ.buyers").toLowerCase()} · CAC ${idr(c.cacIdr)} · ROAS D7 ${x(c.roasD7)} · D30 ${x(c.roasD30)} · LTV ${idr(c.ltvIdr)} · LTV − CAC ${idr(c.ltvMinusCacIdr)}`}
                  </Text>
                </View>
              ))}
            </CardContent>
          </Card>
          <Funnel steps={e.funnel} />
          {e.experiment ? <ExperimentFunnels experiment={e.experiment} /> : null}
          {e.consent.shown > 0 ? (
            <ConsentCard
              total={e.consent}
              arms={e.experiment?.variants.map((v) => ({ name: v.variant, counts: v.consent })) ?? []}
            />
          ) : null}
          <Calculator ltvIdr={e.totals.ltvIdr} settings={e.settings} />
        </>
      ) : q.isError ? (
        <ErrorText>{t("common.error")}</ErrorText>
      ) : null}
      <SpendForm />
    </View>
  );
}

function Funnel({
  steps,
}: {
  steps: {
    step: string;
    visitors: number;
    rate: number | null;
    benchmark: number | null;
    below: boolean;
    firstBad: boolean;
  }[];
}) {
  const { t } = useI18n();
  const top = Math.max(1, steps[0]?.visitors ?? 1);
  return (
    <Card>
      <CardTitle>{t("econ.funnel")}</CardTitle>
      <CardDescription>{t("econ.funnelHint")}</CardDescription>
      <CardContent className="gap-3">
        {steps.map((s) => (
          <View key={s.step} className="gap-1">
            <View className="flex-row justify-between">
              <Text className={cn("font-medium", s.firstBad && "text-destructive")}>
                {t(`funnel.${s.step}` as MessageKey)}
              </Text>
              <Text variant="small" className={cn(s.firstBad && "font-semibold text-destructive")}>
                {`${s.visitors} · ${pct(s.rate)}${s.benchmark !== null ? ` (${t("econ.min")} ${pct(s.benchmark)})` : ""}`}
              </Text>
            </View>
            <View className="h-3 w-full overflow-hidden rounded-full bg-muted">
              <View
                className={cn(
                  "h-3 rounded-full",
                  s.firstBad ? "bg-destructive" : s.below ? "bg-destructive/50" : "bg-primary",
                )}
                style={{ width: `${Math.round((s.visitors / top) * 100)}%` }}
              />
            </View>
            {s.firstBad ? <Text className="text-sm text-destructive">{t("econ.firstBad")}</Text> : null}
          </View>
        ))}
      </CardContent>
    </Card>
  );
}

type FunnelSteps = Parameters<typeof Funnel>[0]["steps"];
type ConsentCounts = { shown: number; granted: number; denied: number; noChoice: number };

/** The marketing consent ask (D-107): asked, allowed, declined, no choice, overall and per A/B arm. */
function ConsentCard({ total, arms }: { total: ConsentCounts; arms: { name: string; counts: ConsentCounts }[] }) {
  const { t } = useI18n();
  const line = (c: ConsentCounts) =>
    `${t("econ.asked")} ${c.shown} · ${t("econ.granted")} ${c.granted} (${pct(c.shown ? c.granted / c.shown : null)}) · ${t("econ.denied")} ${c.denied} · ${t("econ.noChoice")} ${c.noChoice}`;
  return (
    <Card>
      <CardTitle>{t("econ.consent")}</CardTitle>
      <CardDescription>{t("econ.consentHint")}</CardDescription>
      <CardContent className="gap-2">
        <Text testID="consent-total">{line(total)}</Text>
        {arms.map((a) => (
          <Text key={a.name} variant="small">{`${a.name}: ${line(a.counts)}`}</Text>
        ))}
      </CardContent>
    </Card>
  );
}

/** The funnel per A/B arm (D-094): visitors and step rate per arm, side by side per step. */
function ExperimentFunnels({
  experiment,
}: {
  experiment: {
    name: string;
    variants: { variant: string; weight: number; firstSeen: string | null; funnel: FunnelSteps }[];
  };
}) {
  const { t } = useI18n();
  const steps = experiment.variants[0]?.funnel.map((s) => s.step) ?? [];
  return (
    <Card>
      <CardTitle>{`${t("econ.experiment")}: ${experiment.name}`}</CardTitle>
      <CardDescription>{t("econ.experimentHint")}</CardDescription>
      <CardContent className="gap-3">
        <View className="flex-row flex-wrap gap-2">
          {experiment.variants.map((v) => (
            <Text key={v.variant} variant="small" className="rounded-full border border-border px-3 py-1">
              {`${v.variant} · ${v.weight}% · ${v.firstSeen ? `${t("econ.firstSeen")} ${v.firstSeen}` : t("econ.notSeen")}`}
            </Text>
          ))}
        </View>
        {steps.map((step, i) => (
          <View key={step} className="gap-0.5 border-b border-border pb-2">
            <Text className="font-medium">{t(`funnel.${step}` as MessageKey)}</Text>
            {experiment.variants.map((v) => {
              const s = v.funnel[i];
              return (
                <Text key={v.variant} variant="small" className={cn(s?.firstBad && "text-destructive")}>
                  {`${v.variant}: ${s?.visitors ?? 0} · ${pct(s?.rate ?? null)}`}
                </Text>
              );
            })}
          </View>
        ))}
      </CardContent>
    </Card>
  );
}

function Calculator({
  ltvIdr,
  settings,
}: {
  ltvIdr: number | null;
  settings: { paymentFeePercent: number; adTaxPercent: number; targetCacFactor: number };
}) {
  const { t } = useI18n();
  const [planId, setPlanId] = useState(product.plans[0]?.id ?? "");
  const [fee, setFee] = useState(String(settings.paymentFeePercent));
  const [tax, setTax] = useState(String(settings.adTaxPercent));
  const plan = product.plans.find((p) => p.id === planId) ?? product.plans[0];
  const num = (s: string) => Math.max(0, Number(s.replace(",", ".")) || 0);
  const first = cacTargets({
    priceIdr: plan?.priceIdr ?? 0,
    paymentFeePercent: num(fee),
    adTaxPercent: num(tax),
    targetFactor: settings.targetCacFactor,
  });
  const lifetime = ltvIdr
    ? cacTargets({
        priceIdr: ltvIdr,
        paymentFeePercent: num(fee),
        adTaxPercent: num(tax),
        targetFactor: settings.targetCacFactor,
      })
    : null;
  return (
    <Card>
      <CardTitle>{t("econ.calc")}</CardTitle>
      <CardDescription>{t("econ.calcHint")}</CardDescription>
      <CardContent className="gap-3">
        <View className="flex-row flex-wrap gap-2">
          {product.plans.map((p) => (
            <Chip
              key={p.id}
              active={p.id === plan?.id}
              label={`${p.label} · ${formatIdr(p.priceIdr)}`}
              onPress={() => setPlanId(p.id)}
            />
          ))}
        </View>
        <View className="flex-row gap-3">
          <View className="flex-1 gap-1">
            <Text variant="small">{t("econ.fee")}</Text>
            <Input accessibilityLabel={t("econ.fee")} inputMode="decimal" value={fee} onChangeText={setFee} />
          </View>
          <View className="flex-1 gap-1">
            <Text variant="small">{t("econ.tax")}</Text>
            <Input accessibilityLabel={t("econ.tax")} inputMode="decimal" value={tax} onChangeText={setTax} />
          </View>
        </View>
        <Text>{`${t("econ.breakeven")}: ${formatIdr(first.breakevenCacIdr)}`}</Text>
        <Text className="text-lg font-bold">{`${t("econ.target")}: ${formatIdr(first.targetCacIdr)}`}</Text>
        {lifetime ? (
          <Text variant="muted">{`${t("econ.withLtv")} ${formatIdr(ltvIdr ?? 0)}: ${t("econ.breakeven")} ${formatIdr(lifetime.breakevenCacIdr)} · ${t("econ.target")} ${formatIdr(lifetime.targetCacIdr)}`}</Text>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SpendForm() {
  const { t } = useI18n();
  const client = useQueryClient();
  const [date, setDate] = useState(jakartaDay(Date.now()));
  const [campaign, setCampaign] = useState("");
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const spend = useQuery({ queryKey: ["admin-spend"], queryFn: async () => (await api.api.admin.spend.$get()).json() });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["admin-economics"] });
    void client.invalidateQueries({ queryKey: ["admin-spend"] });
  };

  async function add() {
    const res = await api.api.admin.spend.$post({
      json: {
        date,
        channel: "meta",
        campaign: campaign.trim(),
        amountIdr: Math.round(Number(amount.replace(/\D/g, ""))),
      },
    });
    setMessage(res.ok ? { ok: true, text: t("econ.saved") } : { ok: false, text: t("econ.invalid") });
    if (res.ok) refresh();
  }

  async function importCsv(text: string) {
    const res = await fetch(`${apiBaseUrl()}/api/admin/spend/import`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "text/csv" },
      body: text,
    });
    const body = (await res.json().catch(() => ({}))) as { imported?: number; errors?: string[] };
    const errors = body.errors?.length ? ` ${body.errors.slice(0, 3).join(" ")}` : "";
    setMessage({
      ok: res.ok,
      text: res.ok ? `${t("econ.imported")} ${body.imported}.${errors}` : `${t("econ.importFailed")}${errors}`,
    });
    if (res.ok) refresh();
  }

  return (
    <Card>
      <CardTitle>{t("econ.spendTitle")}</CardTitle>
      <CardDescription>{t("econ.spendHint")}</CardDescription>
      <CardContent className="gap-3">
        <Input accessibilityLabel={t("econ.date")} placeholder="YYYY-MM-DD" value={date} onChangeText={setDate} />
        <Input
          accessibilityLabel={t("econ.campaign")}
          placeholder={t("econ.campaign")}
          autoCapitalize="none"
          value={campaign}
          onChangeText={setCampaign}
        />
        <Input
          accessibilityLabel={t("econ.amount")}
          placeholder={t("econ.amount")}
          inputMode="numeric"
          value={amount}
          onChangeText={setAmount}
        />
        <Button onPress={add} disabled={!campaign.trim() || !amount}>
          <Text>{t("econ.add")}</Text>
        </Button>
        <CsvPicker label={t("econ.import")} onText={importCsv} />
        {message ? message.ok ? <Text>{message.text}</Text> : <ErrorText>{message.text}</ErrorText> : null}
        {spend.data?.spend.slice(0, 15).map((s) => (
          <View key={s.id} className="flex-row items-center justify-between gap-2">
            <Text variant="small" className="flex-1" numberOfLines={1}>{`${s.day} · ${s.campaign}`}</Text>
            <Text variant="small">{formatIdr(s.amountIdr)}</Text>
            <Pressable
              role="button"
              accessibilityLabel={t("econ.delete")}
              className="min-h-11 justify-center px-2"
              onPress={async () => {
                await api.api.admin.spend[":id"].$delete({ param: { id: s.id } });
                refresh();
              }}
            >
              <Text className="text-destructive">✕</Text>
            </Pressable>
          </View>
        ))}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <View className="min-w-32 flex-1 gap-1 rounded-lg border border-border bg-card p-4">
      <Text variant="muted">{label}</Text>
      <Text className={cn("text-xl font-bold", bad && "text-destructive")}>{value}</Text>
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      role="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className={cn(
        "min-h-11 justify-center rounded-full border px-4",
        active ? "border-primary bg-primary" : "border-border bg-card",
      )}
    >
      <Text className={cn("text-sm", active ? "text-primary-foreground" : "text-foreground")}>{label}</Text>
    </Pressable>
  );
}
