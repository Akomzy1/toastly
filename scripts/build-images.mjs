/**
 * Build optimised web images from the approved prototype bundles.
 *
 * The prototypes embed 55 photographs as base64 in each bundle's manifest,
 * and name them in `__bundler/ext_resources` ("gallery-white-wedding-lekki",
 * "step-couple-mode", "member-amaka"). This reads both, decodes each named
 * photograph, and writes a resized WebP to public/img/<page>/<id>.webp.
 *
 * Masters are deliberately NOT committed. They stay recoverable at any time
 * from the bundled HTML, which is already in git — so the repo carries the
 * derivatives it serves, not a second copy of the originals.
 *
 * Sizing follows PRD 5.8: the audience is low-end Android on metered data.
 * next/image re-encodes to AVIF/WebP per request, so the source only needs
 * to be large enough for the biggest slot that renders it.
 *
 *   node scripts/build-images.mjs
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const SRC = "design/prototype";
const OUT = "public/img";

// Long-edge cap. Wide heroes and banners keep more; everything else is capped
// well below its 1024-2000px master.
const CAP = (w, h) => (Math.max(w, h) >= 2000 ? 1600 : 1200);
const QUALITY = 78;

// Pages whose images ship elsewhere. brand-assets' PNGs are already installed
// as public/icons and brand/; design-system's are specimens, not page content.
const SKIP = new Set(["brand-assets", "design-system"]);

// Five images are rendered by a page but carry no id in ext_resources -- the
// full-bleed CTA/hero grounds, and two figures. They are named here so they
// are addressable, rather than left out because the bundle forgot to label
// them. The Home hero is among them.
const ALIAS = {
  "098213fb": "cta-final-bg",
  b9c35e09: "cta-mid-bg",
  fbf3de69: "hero-verification",
  "312bce7e": "hero-bg",
  c806e286: "gallery-friends-coffee",
};

function section(html, name) {
  const tag = `<script type="__bundler/${name}">`;
  const i = html.indexOf(tag);
  if (i < 0) return null;
  const start = html.indexOf("\n", i) + 1;
  const end = html.indexOf("</script>", start);
  return html.slice(start, end).trim();
}

const pages = fs
  .readdirSync(SRC)
  .filter((f) => f.endsWith(".html") && !f.endsWith(".slim.html"))
  .sort();

let count = 0;
let before = 0;
let after = 0;
const index = [];

for (const page of pages) {
  const slug = page.replace(/\.html$/, "");
  const html = fs.readFileSync(path.join(SRC, page), "utf8");
  const rawManifest = section(html, "manifest");
  const rawExt = section(html, "ext_resources");
  if (!rawManifest || !rawExt) continue;

  if (SKIP.has(slug)) continue;

  const manifest = JSON.parse(rawManifest);
  const ext = JSON.parse(rawExt);

  // Alt text lives in the rendered markup, not the manifest. Prompt 2 needs
  // real descriptions, so carry them through rather than inventing them.
  const slimPath = path.join(SRC, `${slug}.slim.html`);
  const slim = fs.existsSync(slimPath) ? fs.readFileSync(slimPath, "utf8") : "";
  // Alt text sits beside the image reference in the page's data objects,
  // as: img: res("gist-call"), alt: "Woman laughing during a voice call..."
  // Named images are referenced by id via res()/img(), not by uuid -- only
  // the handful of inline <img> tags carry the uuid directly.
  const altFor = (uuid, id) => {
    for (const needle of [`res("${id}")`, `img("${id}")`, uuid]) {
      const i = slim.indexOf(needle);
      if (i < 0) continue;
      const m = /alt:\s*"([^"]*)"/.exec(slim.slice(i, i + 400)) ||
                /alt="([^"]*)"/.exec(slim.slice(i, i + 260));
      if (m && m[1]) return m[1];
    }
    return "";
  };

  // Only named, local image resources — skip the CDN script entries.
  const named = ext.filter(
    (e) =>
      e.id &&
      !/^https?:/.test(e.id) &&
      manifest[e.uuid] &&
      String(manifest[e.uuid].mime || "").startsWith("image/"),
  );
  // Rendered-but-unnamed images, recovered via ALIAS.
  for (const [short, id] of Object.entries(ALIAS)) {
    const uuid = Object.keys(manifest).find(
      (u) => u.startsWith(short) && String(manifest[u].mime || "").startsWith("image/"),
    );
    if (uuid && slim.includes(uuid) && !named.some((n) => n.uuid === uuid)) {
      named.push({ id, uuid });
    }
  }
  if (!named.length) continue;

  const dir = path.join(OUT, slug);
  fs.mkdirSync(dir, { recursive: true });
  console.log(`\n${slug}`);

  for (const { id, uuid } of named) {
    const entry = manifest[uuid];
    const input = Buffer.from(entry.data, "base64");
    const meta = await sharp(input).metadata();
    const cap = CAP(meta.width, meta.height);

    const dest = path.join(dir, `${id}.webp`);
    await sharp(input)
      .resize({ width: cap, height: cap, fit: "inside", withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toFile(dest);

    const outBytes = fs.statSync(dest).size;
    const out = await sharp(dest).metadata();
    index.push({
      page: slug,
      id,
      src: `/img/${slug}/${id}.webp`,
      width: out.width,
      height: out.height,
      alt: altFor(uuid, id),
    });
    before += input.length;
    after += outBytes;
    count++;
    console.log(
      `  ${id.padEnd(30)} ${String(meta.width).padStart(4)}x${String(meta.height).padEnd(4)} ` +
        `${(input.length / 1024).toFixed(0).padStart(4)} KB -> ${(outBytes / 1024).toFixed(0).padStart(4)} KB`,
    );
  }
}

fs.writeFileSync("lib/images.json", JSON.stringify(index, null, 2));
console.log("wrote lib/images.json: " + index.length + " entries, " +
  index.filter((e) => e.alt).length + " with alt text");

console.log(
  `\n${count} images  ${(before / 1048576).toFixed(1)} MB -> ${(after / 1048576).toFixed(1)} MB ` +
    `(${((after / before) * 100).toFixed(0)}% of original)`,
);
