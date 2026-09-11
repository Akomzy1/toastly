#!/usr/bin/env python3
"""Produce readable .slim.html copies of the bundled Toastly prototype exports.

Each prototype is a "bundled page": a small loader plus a JSON manifest of
base64 assets (images, fonts, video), with the real markup stored as a
JSON-encoded string in a <script type="__bundler/template"> tag. The manifest
is ~75% of every file, which puts the originals (8-20 MB) out of reach of any
tool that has to read them.

This writes, for each page:
  <name>.slim.html   the decoded markup, with bare-UUID asset references
                     rewritten to assets/<uuid>.<ext>
  assets/<uuid>.<ext>  each decoded asset (gunzipped when the manifest says so)

Originals are never modified.

Usage:  python slim_prototypes.py [directory]   (default: design/prototype)
"""

import base64
import gzip
import json
import sys
from pathlib import Path

EXT = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "font/woff2": ".woff2",
    "font/woff": ".woff",
    "text/javascript": ".js",
    "text/jsx": ".jsx",
    "text/css": ".css",
    "video/mp4": ".mp4",
    "audio/mpeg": ".mp3",
}


def section(html: str, name: str):
    """Return the raw text inside <script type="__bundler/NAME">, or None."""
    tag = f'<script type="__bundler/{name}">'
    start = html.find(tag)
    if start < 0:
        return None
    start += len(tag)
    end = html.find("</script>", start)
    if end < 0:
        return None
    return html[start:end].strip()


def slim_page(path: Path, assets_dir: Path) -> tuple[Path, int, int]:
    html = path.read_text(encoding="utf-8")

    raw_manifest = section(html, "manifest")
    raw_template = section(html, "template")
    if raw_manifest is None or raw_template is None:
        raise ValueError("not a bundled page (missing manifest or template)")

    manifest = json.loads(raw_manifest)
    markup = json.loads(raw_template)  # template is a JSON-encoded string

    assets_dir.mkdir(parents=True, exist_ok=True)

    written = 0
    for uuid, entry in manifest.items():
        data = base64.b64decode(entry["data"])
        if entry.get("compressed"):
            data = gzip.decompress(data)
        out = assets_dir / f"{uuid}{EXT.get(entry.get('mime', ''), '.bin')}"
        out.write_bytes(data)
        written += 1
        # Rewrite bare-UUID references (src="<uuid>", url(<uuid>), ...) to the
        # extracted file, so the slim page renders when assets/ is present.
        markup = markup.replace(uuid, f"{assets_dir.name}/{out.name}")

    dest = path.with_name(path.stem + ".slim.html")
    dest.write_text(markup, encoding="utf-8")
    return dest, written, len(markup.encode("utf-8"))


def main() -> int:
    target = Path(sys.argv[1] if len(sys.argv) > 1 else "design/prototype")
    if not target.is_dir():
        print(f"error: {target} is not a directory", file=sys.stderr)
        return 1

    pages = sorted(p for p in target.glob("*.html") if not p.name.endswith(".slim.html"))
    if not pages:
        print(f"error: no .html pages found in {target}", file=sys.stderr)
        return 1

    assets_dir = target / "assets"
    total_before = total_after = 0
    for page in pages:
        before = page.stat().st_size
        try:
            dest, n_assets, after = slim_page(page, assets_dir)
        except (ValueError, KeyError, json.JSONDecodeError) as exc:
            print(f"  skip {page.name}: {exc}", file=sys.stderr)
            continue
        total_before += before
        total_after += after
        print(f"  {page.name:26} {before/1048576:6.1f} MB -> "
              f"{after/1024:7.1f} KB  ({n_assets} assets)")

    if total_before:
        print(f"\n  {'total':26} {total_before/1048576:6.1f} MB -> "
              f"{total_after/1024:7.1f} KB "
              f"({total_after/total_before*100:.2f}% of original)")
        print(f"  assets written to {assets_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
