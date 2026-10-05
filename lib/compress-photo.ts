/**
 * Compress a photo on the phone before upload (PRD §5.1.2, §5.8).
 *
 * Four photos are the minimum to go live, and most members are on rationed
 * mobile data, so every photo is shrunk before it leaves the device: the
 * long edge to 1600px and JPEG re-encoding, stepping quality down until it
 * fits. JPEG specifically, because Smile ID compares JPEGs.
 *
 * Re-encoding through a canvas also drops the original file's metadata
 * (EXIF, including GPS location) — a member's photo never carries where it
 * was taken.
 *
 * BROWSER ONLY.
 */
const MAX_EDGE = 1600;
const TARGET_BYTES = 700 * 1024;
const QUALITIES = [0.82, 0.72, 0.62, 0.52];

export async function compressPhoto(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("not_an_image");

  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no_canvas");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let blob: Blob | null = null;
  for (const q of QUALITIES) {
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", q));
    if (blob && blob.size <= TARGET_BYTES) break;
  }
  if (!blob) throw new Error("encode_failed");
  return blob;
}
