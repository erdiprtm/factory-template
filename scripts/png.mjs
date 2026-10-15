// A small PNG reader, writer and resizer on node:zlib only, for the installable app's icons
// (D-080): `pnpm theme` makes every size from the product's one source icon, with no image
// dependency. Reads 8-bit and 16-bit grey, RGB, palette, grey+alpha and RGBA, non-interlaced;
// writes 8-bit RGBA. Images are { width, height, data: Uint8Array RGBA }.

import { crc32, deflateSync, inflateSync } from "node:zlib";

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/** Width and height from the IHDR chunk, without decoding the pixels. */
export function pngSize(buf) {
  if (!Buffer.from(buf.subarray(0, 8)).equals(SIGNATURE)) throw new Error("not a PNG file");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

export function decodePng(input) {
  const buf = Buffer.from(input);
  if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new Error("not a PNG file");
  let pos = 8;
  let ihdr = null;
  let palette = null;
  let trns = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("latin1", pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len;
    if (type === "IHDR") {
      ihdr = {
        width: body.readUInt32BE(0),
        height: body.readUInt32BE(4),
        depth: body[8],
        color: body[9],
        interlace: body[12],
      };
    } else if (type === "PLTE") palette = body;
    else if (type === "tRNS") trns = body;
    else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
  }
  if (!ihdr) throw new Error("PNG has no IHDR");
  const { width, height, depth, color, interlace } = ihdr;
  const channels = CHANNELS[color];
  if (!channels) throw new Error(`unsupported PNG color type ${color}`);
  if (interlace !== 0) throw new Error("interlaced PNGs are not supported: save it without interlacing");
  if (!(depth === 8 || (depth === 16 && color !== 3)))
    throw new Error(`unsupported PNG bit depth ${depth}: save it as 8-bit RGBA`);
  if (color === 3 && !palette) throw new Error("palette PNG without PLTE");

  const bytes = depth / 8;
  const bpp = channels * bytes;
  const stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(stride * height);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error(`bad PNG filter ${filter}`);
      cur[x] = v & 255;
    }
    prev = cur;
  }

  const data = new Uint8Array(width * height * 4);
  const sample = (i, ch) => out[i * bpp + ch * bytes]; // 16-bit: the high byte
  const trnsValue = (ch) => (trns && trns.length >= (ch + 1) * 2 ? trns.readUInt16BE(ch * 2) : -1);
  const full = (i, ch) => (bytes === 2 ? out.readUInt16BE(i * bpp + ch * 2) : out[i * bpp + ch]);
  for (let i = 0; i < width * height; i++) {
    let r;
    let g;
    let b;
    let alpha = 255;
    if (color === 0 || color === 4) {
      r = g = b = sample(i, 0);
      if (color === 4) alpha = sample(i, 1);
      else if (trns && full(i, 0) === trnsValue(0)) alpha = 0;
    } else if (color === 2 || color === 6) {
      r = sample(i, 0);
      g = sample(i, 1);
      b = sample(i, 2);
      if (color === 6) alpha = sample(i, 3);
      else if (trns && [0, 1, 2].every((ch) => full(i, ch) === trnsValue(ch))) alpha = 0;
    } else {
      const idx = out[i];
      r = palette[idx * 3];
      g = palette[idx * 3 + 1];
      b = palette[idx * 3 + 2];
      if (trns && idx < trns.length) alpha = trns[idx];
    }
    data.set([r, g, b, alpha], i * 4);
  }
  return { width, height, data };
}

function chunk(type, body) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])) >>> 0, 0);
  return Buffer.concat([head, body, crc]);
}

/** 8-bit RGBA PNG; each row gets the filter with the smallest sum (as libpng does). */
export function encodePng({ width, height, data }) {
  const stride = width * 4;
  const rows = [];
  const zero = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const cur = data.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? data.subarray((y - 1) * stride, y * stride) : zero;
    let best = null;
    let bestSum = Number.POSITIVE_INFINITY;
    for (let f = 0; f <= 4; f++) {
      const line = Buffer.alloc(stride + 1);
      line[0] = f;
      let sum = 0;
      for (let x = 0; x < stride; x++) {
        const a = x >= 4 ? cur[x - 4] : 0;
        const b = prev[x];
        const c = x >= 4 ? prev[x - 4] : 0;
        let pred = 0;
        if (f === 1) pred = a;
        else if (f === 2) pred = b;
        else if (f === 3) pred = (a + b) >> 1;
        else if (f === 4) {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        }
        const v = (cur[x] - pred) & 255;
        line[x + 1] = v;
        sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) {
        bestSum = sum;
        best = line;
      }
    }
    rows.push(best);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Box weights: how much of each source pixel falls in each destination pixel (downscaling). */
function weights(src, dst) {
  const scale = src / dst;
  return Array.from({ length: dst }, (_, d) => {
    const start = d * scale;
    const end = start + scale;
    const list = [];
    for (let s = Math.floor(start); s < Math.min(src, Math.ceil(end)); s++) {
      const w = Math.min(end, s + 1) - Math.max(start, s);
      if (w > 0) list.push([s, w / scale]);
    }
    return list;
  });
}

/**
 * Area-average resize (premultiplied alpha, so transparent pixels don't darken edges). For
 * downscaling, which is all the icons need: the source is at least 512 px.
 */
export function resize(img, width, height = width) {
  if (width > img.width || height > img.height) throw new Error("resize only scales down");
  const premul = new Float64Array(img.width * img.height * 4);
  for (let i = 0; i < img.width * img.height; i++) {
    const a = img.data[i * 4 + 3] / 255;
    premul[i * 4] = img.data[i * 4] * a;
    premul[i * 4 + 1] = img.data[i * 4 + 1] * a;
    premul[i * 4 + 2] = img.data[i * 4 + 2] * a;
    premul[i * 4 + 3] = img.data[i * 4 + 3];
  }
  const wx = weights(img.width, width);
  const wy = weights(img.height, height);
  const mid = new Float64Array(width * img.height * 4);
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < width; x++)
      for (const [s, w] of wx[x])
        for (let c = 0; c < 4; c++) mid[(y * width + x) * 4 + c] += premul[(y * img.width + s) * 4 + c] * w;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const px = [0, 0, 0, 0];
      for (const [s, w] of wy[y]) for (let c = 0; c < 4; c++) px[c] += mid[(s * width + x) * 4 + c] * w;
      const a = px[3];
      const i = (y * width + x) * 4;
      data[i + 3] = Math.round(a);
      for (let c = 0; c < 3; c++) data[i + c] = a > 0 ? Math.min(255, Math.round((px[c] * 255) / a)) : 0;
    }
  return { width, height, data };
}

/** "#rrggbb" → [r, g, b]. */
export const hexRgb = (hex) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));

/**
 * An opaque size × size canvas in `fill`, with the source scaled to `scale` of it, centred and
 * composited over the fill (no transparency left: iOS shows transparent pixels black).
 */
export function placeOnFill(img, size, scale, fill) {
  const inner = Math.round(size * scale);
  const small = resize(img, inner);
  const [fr, fg, fb] = fill;
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) data.set([fr, fg, fb, 255], i * 4);
  const off = Math.floor((size - inner) / 2);
  for (let y = 0; y < inner; y++)
    for (let x = 0; x < inner; x++) {
      const s = (y * inner + x) * 4;
      const d = ((y + off) * size + x + off) * 4;
      const a = small.data[s + 3] / 255;
      for (let c = 0; c < 3; c++) data[d + c] = Math.round(small.data[s + c] * a + data[d + c] * (1 - a));
    }
  return { width: size, height: size, data };
}
