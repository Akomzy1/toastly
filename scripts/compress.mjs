import sharp from "sharp";
import fs from "node:fs";
const files = process.argv.slice(2);
for (const f of files) {
  const out = f.replace(/\.png$/, ".jpg");
  await sharp(f).resize({ width: 700 }).jpeg({ quality: 82, mozjpeg: true }).toFile(out);
  console.log(`  ${out.split("/").pop()}  ${(fs.statSync(out).size / 1048576).toFixed(2)} MB`);
}
