import { crc32, deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { decodePng, encodePng, hexRgb, placeOnFill, pngSize, resize } from "./png.mjs";

const solid = (w, h, rgba) => {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(rgba, i * 4);
  return { width: w, height: h, data };
};

describe("png (D-080)", () => {
  it("round-trips RGBA through encode and decode, and reads the size from the header", () => {
    const img = solid(3, 2, [10, 20, 30, 128]);
    img.data.set([255, 0, 0, 255], 4);
    const file = encodePng(img);
    expect(pngSize(file)).toEqual({ width: 3, height: 2 });
    const back = decodePng(file);
    expect(back.width).toBe(3);
    expect(Buffer.from(back.data).equals(Buffer.from(img.data))).toBe(true);
  });

  it("reads 8-bit RGB (no alpha) as opaque", () => {
    // Hand-made 1x1 RGB PNG: filter byte 0, then r g b.
    const enc = encodePng(solid(1, 1, [0, 0, 0, 255]));
    const ihdrAt = 8;
    const ihdr = Buffer.from(enc.subarray(ihdrAt, ihdrAt + 25));
    ihdr[8 + 9] = 2; // color type RGB
    ihdr.writeUInt32BE(crc32(ihdr.subarray(4, 21)) >>> 0, 21);
    const idatBody = deflateSync(Buffer.from([0, 1, 2, 3]));
    const idat = Buffer.alloc(12 + idatBody.length);
    idat.writeUInt32BE(idatBody.length, 0);
    idat.write("IDAT", 4, "latin1");
    idatBody.copy(idat, 8);
    idat.writeUInt32BE(crc32(idat.subarray(4, 8 + idatBody.length)) >>> 0, 8 + idatBody.length);
    const iend = enc.subarray(enc.length - 12);
    const file = Buffer.concat([enc.subarray(0, 8), ihdr, idat, iend]);
    expect([...decodePng(file).data]).toEqual([1, 2, 3, 255]);
  });

  it("refuses what it can't read", () => {
    expect(() => decodePng(Buffer.from("not a png"))).toThrow("not a PNG");
  });

  it("averages areas when scaling down, weighting colour by alpha", () => {
    const img = solid(2, 2, [255, 255, 255, 255]);
    img.data.set([0, 0, 0, 255], 0);
    img.data.set([0, 0, 0, 255], 4);
    expect([...resize(img, 1).data]).toEqual([128, 128, 128, 255]);
    // A transparent black pixel doesn't darken its opaque white neighbour.
    const half = solid(2, 1, [255, 255, 255, 255]);
    half.data.set([0, 0, 0, 0], 0);
    expect([...resize(half, 1, 1).data]).toEqual([255, 255, 255, 128]);
    expect(() => resize(img, 4)).toThrow("only scales down");
  });

  it("places an icon on an opaque fill, centred at the given scale", () => {
    const icon = solid(10, 10, [0, 0, 0, 0]);
    const out = placeOnFill(icon, 10, 0.8, hexRgb("#2563eb"));
    expect(out.width).toBe(10);
    for (let i = 0; i < 100; i++) expect([...out.data.subarray(i * 4, i * 4 + 4)]).toEqual([37, 99, 235, 255]);
  });
});
