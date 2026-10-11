import { describe, expect, it } from "vitest";
import { en } from "../src/core/i18n/en";
import { id } from "../src/core/i18n/id";
import { featureMessages } from "../src/features/messages";

describe("i18n catalogs", () => {
  it("core id and en have the same keys", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(id).sort());
  });

  it("feature messages have both languages and never shadow core keys", () => {
    expect(Object.keys(featureMessages.en).sort()).toEqual(Object.keys(featureMessages.id).sort());
    const core = new Set(Object.keys(id));
    expect(Object.keys(featureMessages.id).filter((k) => core.has(k))).toEqual([]);
  });
});
