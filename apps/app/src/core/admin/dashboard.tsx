import { Card, CardContent, CardDescription, CardTitle, cn, ErrorText, Text } from "@factory/ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { api } from "../api";
import { formatDate, formatIdr } from "../format";
import { type MessageKey, useI18n } from "../i18n";

// /admin's monitoring dashboard (D-113): the range's KPIs against the previous equal period, revenue
// and visitors per day, traffic sources and a live feed. First-party data only. Native-safe: bars are
// plain Views, no chart library.
type Range = "today" | "7d" | "30d";
type Kpi = { value: number | null; trend: number | null };
type SortKey = "visitors" | "buyers" | "revenueIdr" | "roas";

const pct = (n: number | null) => (n === null ? "–" : `${Math.round(n * 1000) / 10}%`);

export function DashboardSection() {
  const { t } = useI18n();
  const [range, setRange] = useState<Range>("7d");
  const q = useQuery({
    queryKey: ["admin-dashboard", range],
    queryFn: async () => {
      const res = await api.api.admin.dashboard.$get({ query: { range } });
      if (!res.ok) throw new Error(`dashboard ${res.status}`);
      return res.json();
    },
  });
  const d = q.data;
  return (
    <View className="gap-4">
      <View className="flex-row flex-wrap gap-2">
        {(["today", "7d", "30d"] as const).map((r) => (
          <Chip key={r} label={t(`dash.range.${r}` as MessageKey)} active={range === r} onPress={() => setRange(r)} />
        ))}
      </View>
      {q.isError ? <ErrorText>{t("common.error")}</ErrorText> : null}
      {d ? (
        <>
          <View className="flex-row flex-wrap gap-3">
            <KpiCard label={t("dash.revenue")} kpi={d.kpis.revenueIdr} format={(v) => formatIdr(v)} />
            <KpiCard label={t("dash.buyers")} kpi={d.kpis.buyers} />
            <KpiCard label={t("dash.renewals")} kpi={d.kpis.renewals} />
            <KpiCard label={t("dash.visitors")} kpi={d.kpis.visitors} />
            <KpiCard label={t("dash.conversion")} kpi={d.kpis.conversion} format={(v) => pct(v)} />
            <KpiCard label={t("dash.activePaid")} kpi={d.kpis.activePaid} />
          </View>
          <Bars
            title={t("dash.revenuePerDay")}
            points={d.series.map((p) => ({ day: p.day, value: p.revenueIdr }))}
            format={(v) => formatIdr(v)}
          />
          <Bars
            title={t("dash.visitorsPerDay")}
            points={d.series.map((p) => ({ day: p.day, value: p.visitors }))}
            format={(v) => String(v)}
          />
          <Sources rows={d.sources} />
        </>
      ) : null}
      <Feed />
    </View>
  );
}

/** One KPI with its change against the previous equal period (▲ up, ▼ down). */
export function KpiCard({ label, kpi, format }: { label: string; kpi: Kpi; format?: (v: number) => string }) {
  const { t } = useI18n();
  const shown = kpi.value === null ? "–" : format ? format(kpi.value) : String(kpi.value);
  const up = (kpi.trend ?? 0) > 0;
  const down = (kpi.trend ?? 0) < 0;
  return (
    // One column on a phone (375 px), two from sm, three from lg.
    <View className="w-full gap-1 rounded-lg border border-border bg-card p-4 sm:w-[48%] lg:w-[31%]">
      <Text variant="muted">{label}</Text>
      <Text className="text-2xl font-bold text-foreground">{shown}</Text>
      {kpi.trend === null ? null : (
        <Text
          className={cn(
            "text-sm",
            up && "text-primary",
            down && "text-destructive",
            !up && !down && "text-muted-foreground",
          )}
          accessibilityLabel={`${t("dash.vsPrevious")} ${pct(kpi.trend)}`}
        >
          {`${up ? "▲" : down ? "▼" : "•"} ${pct(Math.abs(kpi.trend))} ${t("dash.vsPrevious")}`}
        </Text>
      )}
    </View>
  );
}

/** A per-day bar chart from plain Views (native-safe), with its numbers in the accessibility label. */
export function Bars({
  title,
  points,
  format,
}: {
  title: string;
  points: { day: string; value: number }[];
  format: (v: number) => string;
}) {
  const { locale } = useI18n();
  const top = Math.max(1, ...points.map((p) => p.value));
  const total = points.reduce((s, p) => s + p.value, 0);
  return (
    <Card>
      <CardTitle>{title}</CardTitle>
      <CardDescription>{format(total)}</CardDescription>
      <CardContent>
        <View
          role="img"
          accessibilityLabel={`${title}: ${points.map((p) => `${p.day} ${format(p.value)}`).join(", ")}`}
          className="h-32 flex-row items-end gap-1"
        >
          {points.map((p) => (
            <View key={p.day} className="flex-1 justify-end" style={{ height: "100%" }}>
              <View
                testID="bar"
                className="w-full rounded-t bg-primary"
                style={{ height: `${Math.max(p.value > 0 ? 4 : 0, Math.round((p.value / top) * 100))}%` }}
              />
            </View>
          ))}
        </View>
        {points.length > 0 ? (
          <View className="flex-row justify-between">
            <Text variant="small">{formatDate(`${points[0]?.day}T12:00:00+07:00`, locale)}</Text>
            {points.length > 1 ? (
              <Text variant="small">{formatDate(`${points.at(-1)?.day}T12:00:00+07:00`, locale)}</Text>
            ) : null}
          </View>
        ) : null}
      </CardContent>
    </Card>
  );
}

type SourceRow = {
  source: string | null;
  campaign: string | null;
  visitors: number;
  firstResults: number;
  buyers: number;
  revenueIdr: number;
  cacIdr: number | null;
  roas: number | null;
};

/** Traffic sources, sortable: visitors, buyers, revenue, ROAS (D-113). */
export function Sources({ rows }: { rows: SourceRow[] }) {
  const { t } = useI18n();
  const [sort, setSort] = useState<SortKey>("revenueIdr");
  const sorted = [...rows].sort((a, b) => (b[sort] ?? -1) - (a[sort] ?? -1));
  return (
    <Card>
      <CardTitle>{t("dash.sources")}</CardTitle>
      <CardContent className="gap-3">
        <View className="flex-row flex-wrap gap-2">
          {(["revenueIdr", "buyers", "visitors", "roas"] as const).map((k) => (
            <Chip key={k} label={t(`dash.sort.${k}` as MessageKey)} active={sort === k} onPress={() => setSort(k)} />
          ))}
        </View>
        {sorted.length === 0 ? <Text variant="muted">{t("econ.noData")}</Text> : null}
        {sorted.map((r) => (
          <View key={`${r.source}:${r.campaign}`} testID="source-row" className="gap-0.5 border-b border-border pb-2">
            <Text className="font-semibold">
              {r.source || r.campaign ? [r.source, r.campaign].filter(Boolean).join(" / ") : t("dash.direct")}
            </Text>
            <Text variant="small">
              {`${t("dash.visitors")} ${r.visitors} · ${t("dash.firstResults")} ${r.firstResults} · ${t("dash.buyers")} ${r.buyers} · ${formatIdr(r.revenueIdr)}${r.cacIdr !== null ? ` · CAC ${formatIdr(r.cacIdr)}` : ""}${r.roas !== null ? ` · ROAS ${r.roas.toFixed(2)}×` : ""}`}
            </Text>
          </View>
        ))}
      </CardContent>
    </Card>
  );
}

/** The newest payments and sign-ups, refreshed every 30 s while /admin is open (D-113). */
function Feed() {
  const { t, locale } = useI18n();
  const q = useQuery({
    queryKey: ["admin-feed"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const res = await api.api.admin.feed.$get();
      if (!res.ok) throw new Error(`feed ${res.status}`);
      return res.json();
    },
  });
  return (
    <Card>
      <CardTitle>{t("dash.feed")}</CardTitle>
      <CardDescription>{t("dash.feedHint")}</CardDescription>
      <CardContent className="gap-2">
        {q.data?.items.length === 0 ? <Text variant="muted">{t("econ.noData")}</Text> : null}
        {q.data?.items.map((item) => (
          <View
            key={`${item.kind}:${item.at}:${item.who}`}
            testID="feed-item"
            className="flex-row justify-between gap-2"
          >
            <Text variant="small" className="flex-1" numberOfLines={1}>
              {item.kind === "signup"
                ? `${t("dash.signup")} · ${item.who}`
                : `${t(`account.status.${item.status}` as MessageKey)} · ${item.planId} · ${formatIdr(item.amountIdr)} · ${item.who}`}
            </Text>
            <Text variant="small" className="text-muted-foreground">
              {formatDate(item.at, locale)}
            </Text>
          </View>
        ))}
      </CardContent>
    </Card>
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
