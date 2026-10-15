// Server-side check of a model's JSON answer against the request's schema (D-045, D-083, D-084).
// Strict structured output is a guarantee at OpenAI, but OpenRouter says some providers treat the
// schema only as a strong hint, and Gemini supports a subset of JSON Schema. So the answer is
// re-validated here before a product sees it. Pure, no dependencies.
//
// Checked keywords: type (one or a list, "null" included), enum, const, properties, required,
// additionalProperties (false or a schema), items, prefixItems, minItems, maxItems, minimum,
// maximum, minLength, maxLength, anyOf. Other keywords are ignored (they constrain nothing here).

import type { JsonSchema } from "./index";

const typeOf = (v: unknown): string =>
  v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v;

function typeMatches(want: unknown, v: unknown): boolean {
  const t = typeOf(v);
  const list = Array.isArray(want) ? want : [want];
  return list.some((w) => w === t || (w === "number" && t === "integer"));
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The first place `value` breaks `schema` ("$.items[0].kcal: type"), or null when it conforms. */
export function schemaError(schema: JsonSchema, value: unknown, path = "$"): string | null {
  const s = schema as Record<string, unknown>;
  if (s.type !== undefined && !typeMatches(s.type, value)) return `${path}: type`;
  if (Array.isArray(s.enum) && !s.enum.some((e) => same(e, value))) return `${path}: enum`;
  if ("const" in s && !same(s.const, value)) return `${path}: const`;
  if (Array.isArray(s.anyOf) && !s.anyOf.some((alt) => schemaError(alt as JsonSchema, value, path) === null))
    return `${path}: anyOf`;
  if (typeof value === "number") {
    if (typeof s.minimum === "number" && value < s.minimum) return `${path}: minimum`;
    if (typeof s.maximum === "number" && value > s.maximum) return `${path}: maximum`;
  }
  if (typeof value === "string") {
    if (typeof s.minLength === "number" && value.length < s.minLength) return `${path}: minLength`;
    if (typeof s.maxLength === "number" && value.length > s.maxLength) return `${path}: maxLength`;
  }
  if (Array.isArray(value)) {
    if (typeof s.minItems === "number" && value.length < s.minItems) return `${path}: minItems`;
    if (typeof s.maxItems === "number" && value.length > s.maxItems) return `${path}: maxItems`;
    const prefix = Array.isArray(s.prefixItems) ? (s.prefixItems as JsonSchema[]) : [];
    for (let i = 0; i < value.length; i++) {
      const item = i < prefix.length ? prefix[i] : s.items;
      if (item && typeof item === "object") {
        const e = schemaError(item as JsonSchema, value[i], `${path}[${i}]`);
        if (e) return e;
      }
    }
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const props = (s.properties ?? {}) as Record<string, JsonSchema>;
    for (const key of Array.isArray(s.required) ? (s.required as string[]) : [])
      if (!(key in obj)) return `${path}.${key}: required`;
    for (const [key, v] of Object.entries(obj)) {
      const prop = props[key];
      if (prop) {
        const e = schemaError(prop, v, `${path}.${key}`);
        if (e) return e;
      } else if (s.additionalProperties === false) return `${path}.${key}: additionalProperties`;
      else if (s.additionalProperties && typeof s.additionalProperties === "object") {
        const e = schemaError(s.additionalProperties as JsonSchema, v, `${path}.${key}`);
        if (e) return e;
      }
    }
  }
  return null;
}

// Gemini's structured output supports a subset of JSON Schema (ai.google.dev structured-output
// guide, read 2026-10-15). Keywords outside it are dropped before sending, and `const` becomes a
// one-value enum. The original schema still re-validates the answer, so a dropped constraint
// (pattern, minLength, …) is still enforced, just on our side.
const GEMINI_KEYWORDS = new Set([
  "type",
  "title",
  "description",
  "properties",
  "required",
  "additionalProperties",
  "enum",
  "format",
  "minimum",
  "maximum",
  "items",
  "prefixItems",
  "minItems",
  "maxItems",
  "anyOf",
]);
const GEMINI_FORMATS = new Set(["date-time", "date", "time"]);

/** The request's schema in the subset Gemini documents (exported for tests). */
export function geminiSchema(schema: JsonSchema): JsonSchema {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === "const") out.enum = [v];
    else if (!GEMINI_KEYWORDS.has(k)) continue;
    else if (k === "format") {
      if (typeof v === "string" && GEMINI_FORMATS.has(v)) out.format = v;
    } else if (k === "properties" && v && typeof v === "object")
      out.properties = Object.fromEntries(
        Object.entries(v as Record<string, JsonSchema>).map(([p, s]) => [p, geminiSchema(s)]),
      );
    else if ((k === "items" || k === "additionalProperties") && v && typeof v === "object")
      out[k] = geminiSchema(v as JsonSchema);
    else if ((k === "prefixItems" || k === "anyOf") && Array.isArray(v))
      out[k] = v.map((s) => geminiSchema(s as JsonSchema));
    else out[k] = v;
  }
  return out;
}
