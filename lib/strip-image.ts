/**
 * Strip a JPEG down to the picture (PRD §5.1.2; decided 6 October 2026).
 *
 * Every image enters storage through the server, and through this: the phone
 * already re-encodes through a canvas (lib/compress-photo.ts), which drops
 * metadata, but a modified client could send anything — so the server never
 * trusts that it did.
 *
 * Lossless: the segments a decoder needs (quantisation and Huffman tables,
 * the frame header, restart interval, the scans) are copied byte for byte.
 * Dropped:
 *   - APP0–APP15: JFIF and its thumbnail, EXIF (GPS location, camera, time,
 *     its own thumbnail), XMP, ICC profiles, Photoshop and maker data, and
 *     multi-picture indexes — except a bare Adobe APP14 colour-transform flag,
 *     which carries nothing about the person and which a CMYK picture needs;
 *   - comments (COM);
 *   - anything after the end-of-image marker (motion-photo video, trailers).
 *
 * Throws on anything that isn't a well-formed baseline or progressive JPEG.
 * Pure — no I/O — so it's tested directly (scripts/strip-image.test.mjs).
 */

const SOI = 0xd8;
const EOI = 0xd9;
const SOS = 0xda;
const COM = 0xfe;

export class NotAJpeg extends Error {
  constructor(why: string) {
    super(`not a usable JPEG: ${why}`);
  }
}

function isAdobeFlag(bytes: Uint8Array, start: number, length: number): boolean {
  // "Adobe" + version(2) + flags0(2) + flags1(2) + transform(1) = 12 bytes.
  return (
    length === 14 &&
    bytes[start + 4] === 0x41 && bytes[start + 5] === 0x64 && bytes[start + 6] === 0x6f &&
    bytes[start + 7] === 0x62 && bytes[start + 8] === 0x65
  );
}

export function stripJpeg(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== SOI) throw new NotAJpeg("no start marker");

  const out: Uint8Array[] = [bytes.subarray(0, 2)];
  let i = 2;
  let frames = 0;
  let scans = 0;

  for (;;) {
    // A marker: 0xFF, any fill bytes, then the code.
    if (i >= bytes.length || bytes[i] !== 0xff) throw new NotAJpeg("expected a marker");
    while (bytes[i] === 0xff) i++;
    if (i >= bytes.length) throw new NotAJpeg("truncated");
    const code = bytes[i];
    const markerStart = i - 1;
    i++;

    if (code === EOI) {
      if (!frames || !scans) throw new NotAJpeg("no picture");
      out.push(new Uint8Array([0xff, EOI]));
      break; // and nothing after it
    }
    if (code >= 0xd0 && code <= 0xd7) throw new NotAJpeg("restart marker outside a scan");
    if (code === SOI || code === 0x01) throw new NotAJpeg("unexpected marker");

    if (i + 2 > bytes.length) throw new NotAJpeg("truncated");
    const length = (bytes[i] << 8) | bytes[i + 1];
    if (length < 2 || i + length > bytes.length) throw new NotAJpeg("bad segment length");
    const segment = bytes.subarray(markerStart, i + length);
    const isApp = code >= 0xe0 && code <= 0xef;
    const keep = !(isApp || code === COM) || (code === 0xee && isAdobeFlag(bytes, markerStart, length));
    if (keep) out.push(segment);
    if (code >= 0xc0 && code <= 0xcf && code !== 0xc4 && code !== 0xc8 && code !== 0xcc) frames++;
    i += length;

    if (code === SOS) {
      if (!frames) throw new NotAJpeg("scan before frame");
      scans++;
      // Entropy-coded data runs to the next marker that isn't a stuffed byte
      // (FF00), a restart (FFD0–FFD7) or fill (FFFF…).
      const start = i;
      for (;;) {
        if (i + 1 >= bytes.length) throw new NotAJpeg("truncated scan");
        if (bytes[i] === 0xff) {
          const next = bytes[i + 1];
          if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
            i += 2;
            continue;
          }
          if (next === 0xff) {
            i++;
            continue;
          }
          break;
        }
        i++;
      }
      out.push(bytes.subarray(start, i));
    }
  }

  const total = out.reduce((n, b) => n + b.length, 0);
  const result = new Uint8Array(total);
  let at = 0;
  for (const b of out) {
    result.set(b, at);
    at += b.length;
  }
  return result;
}
