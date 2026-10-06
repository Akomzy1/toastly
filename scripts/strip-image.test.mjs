/**
 * Every uploaded photo is stripped of embedded data before it is stored —
 * and so before it is ever displayed (lib/strip-image.ts; decided 6 October
 * 2026). Pure: no storage, no network.
 *
 *   node --test scripts/strip-image.test.mjs
 *
 * What's stripped: EXIF (with GPS location), XMP, ICC, JFIF and its
 * thumbnail, Photoshop/maker data, comments, and anything after the end of
 * the image (motion-photo video, trailers). What's kept, byte for byte: the
 * tables, the frame header and the scans — the picture itself.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { stripJpeg } from "../lib/strip-image.ts";

const ascii = (s) => [...Buffer.from(s, "latin1")];
const seg = (code, payload) => {
  const len = payload.length + 2;
  return [0xff, code, len >> 8, len & 0xff, ...payload];
};
const has = (bytes, s) => Buffer.from(bytes).includes(Buffer.from(s, "latin1"));

// The picture: tables, frame, Huffman, a scan with stuffed bytes and a restart.
const DQT = seg(0xdb, [0x00, ...Array(64).fill(1)]);
const SOF0 = seg(0xc0, [8, 0, 16, 0, 16, 1, 1, 0x11, 0]);
const DHT = seg(0xc4, [0x00, ...Array(16).fill(0), 0]);
const DRI = seg(0xdd, [0, 4]);
const SOS = seg(0xda, [1, 1, 0x00, 0, 63, 0]);
const SCAN = [0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56, 0x78];

// Everything that must go.
const GPS = "GPSLatitude 6.5244 N GPSLongitude 3.3792 E";
const JFIF = seg(0xe0, [...ascii("JFIF\0"), 1, 2, 0, 0, 1, 0, 1, 1, 1, 0xab, 0xcd, 0xef]); // with a 1x1 thumbnail
const EXIF = seg(0xe1, ascii(`Exif\0\0MM\0*Canon EOS 2026:10:06 09:41:00 ${GPS}`));
const XMP = seg(0xe1, ascii('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta><photoshop:City>Lagos</photoshop:City></x:xmpmeta>'));
const ICC = seg(0xe2, ascii("ICC_PROFILE\0\x01\x01display-p3"));
const IRB = seg(0xed, ascii("Photoshop 3.0\x008BIM caption: home address"));
const COMMENT = seg(0xfe, ascii("taken at home, Lekki"));
const TRAILER = ascii("MotionPhoto_Data....ftypmp42 video bytes");

const picture = [...DQT, ...SOF0, ...DHT, ...DRI, ...SOS, ...SCAN];
const dirty = Uint8Array.from([0xff, 0xd8, ...JFIF, ...EXIF, ...XMP, ...ICC, ...IRB, ...COMMENT, ...picture, 0xff, 0xd9, ...TRAILER]);

test("EXIF and GPS location, XMP, ICC, JFIF thumbnail, Photoshop data and comments are removed", () => {
  const clean = stripJpeg(dirty);
  for (const s of ["Exif", "GPS", "6.5244", "Canon", "2026:10:06", "xap", "Lagos", "ICC_PROFILE", "8BIM", "home address", "Lekki", "JFIF"]) {
    assert.equal(has(clean, s), false, `"${s}" survived`);
  }
});

test("nothing after the end of the image survives (motion-photo video, trailers)", () => {
  const clean = stripJpeg(dirty);
  assert.equal(has(clean, "MotionPhoto"), false);
  assert.deepEqual([...clean.slice(-2)], [0xff, 0xd9], "ends at the end-of-image marker");
});

test("the picture itself is kept byte for byte", () => {
  const clean = stripJpeg(dirty);
  assert.deepEqual([...clean], [0xff, 0xd8, ...picture, 0xff, 0xd9]);
});

test("stripping is idempotent", () => {
  const once = stripJpeg(dirty);
  assert.deepEqual([...stripJpeg(once)], [...once]);
});

test("a bare Adobe colour-transform flag is kept; an Adobe segment carrying more is not", () => {
  const flag = seg(0xee, [...ascii("Adobe"), 0, 100, 0, 0, 0, 0, 1]);
  const big = seg(0xee, [...ascii("Adobe"), 0, 100, 0, 0, 0, 0, 1, ...ascii("extra")]);
  assert.equal(has(stripJpeg(Uint8Array.from([0xff, 0xd8, ...flag, ...picture, 0xff, 0xd9])), "Adobe"), true);
  assert.equal(has(stripJpeg(Uint8Array.from([0xff, 0xd8, ...big, ...picture, 0xff, 0xd9])), "Adobe"), false);
});

test("a real photo with GPS injected comes out as the original picture, GPS gone", () => {
  const dir = "design/prototype/assets";
  const file = fs.readdirSync(dir).filter((f) => f.endsWith(".jpg")).map((f) => path.join(dir, f)).find((f) => fs.statSync(f).size > 30_000);
  assert.ok(file, "a prototype JPEG to test with");
  const original = new Uint8Array(fs.readFileSync(file));
  const baseline = stripJpeg(original);
  const withGps = Uint8Array.from([0xff, 0xd8, ...EXIF, ...original.slice(2), ...TRAILER]);
  const clean = stripJpeg(withGps);
  assert.equal(has(clean, "GPS"), false);
  assert.equal(has(clean, "MotionPhoto"), false);
  assert.deepEqual(Buffer.from(clean), Buffer.from(baseline), "same picture bytes as the original, stripped");
  assert.ok(clean.length > 20_000, "the picture data is all there");
});

test("a photo with real EXIF, GPS, XMP and an ICC profile decodes to the same pixels with all of it gone", async () => {
  const sharp = (await import("sharp")).default;
  const pixels = { width: 64, height: 48, channels: 3 };
  const raw = Buffer.alloc(64 * 48 * 3).map((_, i) => (i * 37) % 251);
  const tagged = await sharp(raw, { raw: pixels })
    .jpeg({ quality: 90 })
    .withExif({
      IFD0: { Make: "Canon", Model: "EOS 2026", DateTime: "2026:10:06 09:41:00" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "6/1 31/1 28/1", GPSLongitudeRef: "E", GPSLongitude: "3/1 22/1 45/1" },
    })
    .withXmp('<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/" photoshop:City="Lagos"/></rdf:RDF></x:xmpmeta>')
    .toBuffer();
  const before = await sharp(tagged).metadata();
  assert.ok(before.exif && before.xmp, "the test photo really carries EXIF and XMP");
  assert.ok(has(tagged, "Canon") && has(tagged, "Lagos"));

  const clean = Buffer.from(stripJpeg(new Uint8Array(tagged)));
  const after = await sharp(clean).metadata();
  assert.equal(after.exif, undefined, "no EXIF (and so no GPS)");
  assert.equal(after.xmp, undefined, "no XMP");
  assert.equal(has(clean, "Canon") || has(clean, "Lagos") || has(clean, "GPS"), false);
  assert.equal(after.width, 64);
  assert.equal(after.height, 48);
  const [a, b] = await Promise.all([sharp(tagged).raw().toBuffer(), sharp(clean).raw().toBuffer()]);
  assert.ok(a.equals(b), "the same picture, decoded pixel for pixel");

  // An ICC profile goes too. (Our own uploads never carry one: the phone's
  // canvas re-encode is untagged sRGB. Only a modified client's file loses
  // its colour profile.)
  const icc = await sharp(raw, { raw: pixels }).jpeg().withIccProfile("p3").toBuffer();
  assert.ok((await sharp(icc).metadata()).icc);
  const iccClean = Buffer.from(stripJpeg(new Uint8Array(icc)));
  const m = await sharp(iccClean).metadata();
  assert.equal(m.icc, undefined, "no ICC profile");
  assert.equal((await sharp(iccClean).raw().toBuffer()).length, 64 * 48 * 3, "still decodes");
});

test("anything that isn't a JPEG is refused, not stored", () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.throws(() => stripJpeg(png), /not a usable JPEG/);
  assert.throws(() => stripJpeg(Uint8Array.from([0xff, 0xd8, ...EXIF, 0xff, 0xd9])), /no picture/, "metadata with no picture");
  assert.throws(() => stripJpeg(Uint8Array.from([0xff, 0xd8, ...picture])), /truncated/, "no end marker");
  assert.throws(() => stripJpeg(Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff])), /bad segment length/);
});
