import { describe, expect, it } from "vitest";
import { aspectRatio, logoSize } from "../src/lib/logo.mjs";

// D-096: the header logo's width comes from the served file, so the <img> reserves its space.
const svg = (attrs: string) =>
  Buffer.from(`<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" ${attrs}></svg>`);

describe("aspectRatio", () => {
  it("reads an SVG's viewBox, else its width and height", () => {
    expect(aspectRatio(svg('viewBox="0 0 120 34"'), "/logo.svg")).toBeCloseTo(120 / 34);
    expect(aspectRatio(svg("viewBox='0,0,64,32'"), "/logo.svg")).toBe(2);
    expect(aspectRatio(svg('width="90" height="30"'), "/logo.svg")).toBe(3);
    expect(aspectRatio(svg(""), "/logo.svg")).toBeNull();
  });

  it("reads a PNG's IHDR and refuses other formats", () => {
    const png = Buffer.alloc(24);
    png.writeUInt32BE(200, 16);
    png.writeUInt32BE(50, 20);
    expect(aspectRatio(png, "/logo.png")).toBe(4);
    expect(aspectRatio(Buffer.from("x"), "/logo.webp")).toBeNull();
  });
});

describe("logoSize", () => {
  it("scales the served logo to the configured height; unreadable = no width", () => {
    const pub = new URL("../public/", import.meta.url);
    expect(logoSize(pub, "/logo.svg", 32)).toMatchObject({ height: 32 });
    expect(logoSize(pub, "/missing.svg", 32)).toEqual({ width: null, height: 32 });
  });
});
