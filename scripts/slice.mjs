import sharp from "sharp";
const [, , src, outPrefix, nStr] = process.argv;
const n = Number(nStr || 4);
const img = sharp(src);
const { width, height } = await img.metadata();
const band = Math.ceil(height / n);
for (let i = 0; i < n; i++) {
  const top = i * band;
  const h = Math.min(band, height - top);
  if (h <= 0) break;
  await sharp(src)
    .extract({ left: 0, top, width, height: h })
    .resize({ width: 430 })
    .png()
    .toFile(`${outPrefix}-${i + 1}.png`);
  console.log(`${outPrefix}-${i + 1}.png  (rows ${top}-${top + h})`);
}
