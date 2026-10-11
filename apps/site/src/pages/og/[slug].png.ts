import { getCollection } from "astro:content";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import type { APIRoute, GetStaticPaths } from "astro";
import satori from "satori";
import { fillPlaceholders, product } from "../../lib/site";

// Open Graph images (1200×630 PNG) rendered at build time: satori → SVG → resvg (wasm, no native deps).
const require = createRequire(import.meta.url);
let wasmReady: Promise<void> | undefined;
const initResvg = () => {
  wasmReady ??= readFile(require.resolve("@resvg/resvg-wasm/index_bg.wasm")).then((buf) => initWasm(buf));
  return wasmReady;
};
// @fontsource/inter only exports CSS; its .woff files sit next to index.css (satori can't read woff2).
const fontDir = join(dirname(require.resolve("@fontsource/inter")), "files");
const fonts = Promise.all([
  readFile(join(fontDir, "inter-latin-700-normal.woff")),
  readFile(join(fontDir, "inter-latin-400-normal.woff")),
]);

export const getStaticPaths = (async () => {
  const fixed = [
    { slug: "home", title: product.tagline },
    { slug: "harga", title: "Harga" },
    { slug: "kontak", title: "Kontak" },
  ];
  const legal = (await getCollection("legal")).map((e) => ({ slug: e.id, title: fillPlaceholders(e.data.title) }));
  const seo = (await getCollection("seo")).map((e) => ({ slug: e.id, title: e.data.title }));
  return [...fixed, ...legal, ...seo].map(({ slug, title }) => ({ params: { slug }, props: { title } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) => {
  await initResvg();
  const [bold, regular] = await fonts;
  const { primary, primaryForeground } = product.brand.tokens.colors.light;
  const svg = await satori(
    {
      type: "div",
      key: "root",
      props: {
        style: {
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: 80,
          background: primary,
          color: primaryForeground,
          fontFamily: "Inter",
        },
        children: [
          {
            type: "div",
            key: "name",
            props: { style: { fontSize: 36, fontWeight: 400, opacity: 0.85 }, children: product.name },
          },
          {
            type: "div",
            key: "title",
            props: {
              style: { fontSize: 68, fontWeight: 700, lineHeight: 1.15, maxWidth: 1000 },
              children: String(props.title),
            },
          },
        ],
      },
    },
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: "Inter", data: bold, weight: 700, style: "normal" },
        { name: "Inter", data: regular, weight: 400, style: "normal" },
      ],
    },
  );
  const png = new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng();
  return new Response(new Uint8Array(png), { headers: { "content-type": "image/png" } });
};
