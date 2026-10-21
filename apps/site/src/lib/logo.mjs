// The site header's logo (D-095): its width at the configured height, read from the file the site
// serves, so the <img> reserves its space (no layout shift). SVG: viewBox, else width/height; PNG: IHDR.
import { readFileSync } from "node:fs";

/** Intrinsic aspect ratio (width / height) of an SVG or PNG, or null when it can't be read. */
export function aspectRatio(bytes, path) {
  if (path.endsWith(".png")) {
    if (bytes.length < 24) return null;
    const w = bytes.readUInt32BE(16);
    const h = bytes.readUInt32BE(20);
    return w > 0 && h > 0 ? w / h : null;
  }
  if (!path.endsWith(".svg")) return null;
  const svg = bytes.toString("utf8").match(/<svg\b[^>]*>/i)?.[0] ?? "";
  const box = svg.match(/viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/i);
  const [w, h] = box
    ? [Number(box[1]), Number(box[2])]
    : [Number(svg.match(/\swidth\s*=\s*["']([\d.]+)/i)?.[1]), Number(svg.match(/\sheight\s*=\s*["']([\d.]+)/i)?.[1])];
  return w > 0 && h > 0 ? w / h : null;
}

/** { width, height } for the header logo at `height` px; width is null when the file can't be read. */
export function logoSize(publicDir, logo, height) {
  try {
    const ratio = aspectRatio(readFileSync(new URL(logo.slice(1), publicDir)), logo);
    return { width: ratio ? Math.round(height * ratio) : null, height };
  } catch {
    return { width: null, height };
  }
}
