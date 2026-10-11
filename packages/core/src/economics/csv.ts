// Meta Ads Manager CSV export → daily spend rows (D-038). Export with Breakdown → By time → Day,
// columns at least: Day (or Reporting starts/ends), Campaign name, Amount spent (IDR).
// English and Indonesian column names are accepted.
import type { SpendEntry } from "./metrics";

/** RFC 4180-ish: quoted fields, doubled quotes, CRLF or LF, comma or semicolon separated. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

const norm = (h: string) => h.trim().toLowerCase().replace(/\s+/g, " ");
const COLUMNS = {
  day: ["day", "hari", "date", "tanggal"],
  start: ["reporting starts", "awal pelaporan", "reporting start"],
  end: ["reporting ends", "akhir pelaporan", "reporting end"],
  campaign: ["campaign name", "nama kampanye", "campaign"],
  amount: ["amount spent (idr)", "jumlah yang dibelanjakan (idr)", "amount spent", "jumlah yang dibelanjakan", "spend"],
};

/** "150000", "150000.50", "150.000", "150,000", "Rp 150.000" → 150000 (integer IDR). */
export function parseAmount(raw: string): number | null {
  let s = raw.replace(/[^\d.,-]/g, "");
  if (!s) return null;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  const decimalSep = lastDot > lastComma ? "." : ",";
  const decimals = s.length - 1 - Math.max(lastDot, lastComma);
  // One separator followed by exactly 3 digits is a thousands separator (IDR has no cents).
  const onlyThousands = (lastDot === -1 || lastComma === -1) && decimals === 3;
  if (onlyThousands || Math.max(lastDot, lastComma) === -1) s = s.replace(/[.,]/g, "");
  else {
    const thousands = decimalSep === "." ? "," : ".";
    s = s.split(thousands).join("").replace(decimalSep, ".");
  }
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
/** "2026-10-11", "11/10/2026" (d/m/y, Indonesian exports) → "2026-10-11". */
export function parseDay(raw: string): string | null {
  const s = raw.trim();
  if (ISO.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${(m[2] as string).padStart(2, "0")}-${(m[1] as string).padStart(2, "0")}`;
  return null;
}

export type CsvImport = { rows: SpendEntry[]; errors: string[] };

export function spendFromMetaCsv(text: string, channel = "meta"): CsvImport {
  const [header, ...lines] = parseCsv(text);
  if (!header) return { rows: [], errors: ["File kosong."] };
  const h = header.map(norm);
  const col = (names: string[]) => h.findIndex((x) => names.includes(x));
  const iDay = col(COLUMNS.day);
  const iStart = col(COLUMNS.start);
  const iEnd = col(COLUMNS.end);
  const iCampaign = col(COLUMNS.campaign);
  const iAmount = col(COLUMNS.amount);
  const errors: string[] = [];
  if (iCampaign < 0) errors.push('Kolom "Campaign name" / "Nama kampanye" tidak ada.');
  if (iAmount < 0) errors.push('Kolom "Amount spent (IDR)" / "Jumlah yang dibelanjakan (IDR)" tidak ada.');
  if (iDay < 0 && iStart < 0) errors.push('Kolom "Day" / "Hari" atau "Reporting starts" tidak ada.');
  if (errors.length > 0) return { rows: [], errors };

  const totals = new Map<string, SpendEntry>();
  lines.forEach((line, n) => {
    const campaign = (line[iCampaign] ?? "").trim();
    if (!campaign) return; // summary rows have no campaign
    let day = iDay >= 0 ? parseDay(line[iDay] ?? "") : null;
    if (!day && iStart >= 0) {
      const start = parseDay(line[iStart] ?? "");
      const end = iEnd >= 0 ? parseDay(line[iEnd] ?? "") : start;
      if (start && start === end) day = start;
      else if (start) {
        errors.push(`Baris ${n + 2}: rentang beberapa hari. Export ulang dengan Breakdown → By time → Day.`);
        return;
      }
    }
    const amount = parseAmount(line[iAmount] ?? "");
    if (!day || amount === null) {
      errors.push(`Baris ${n + 2}: tanggal atau jumlah tidak terbaca.`);
      return;
    }
    const key = `${day}|${campaign}`;
    const cur = totals.get(key);
    totals.set(key, { date: day, channel, campaign, amountIdr: (cur?.amountIdr ?? 0) + amount });
  });
  return { rows: [...totals.values()], errors };
}
