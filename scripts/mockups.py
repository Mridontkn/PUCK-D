#!/usr/bin/env python3
"""Generate the city × colour hat photos from Printful mockups.

    31 cities × 11 colours = 341 images, written as WebP at 900px:
        assets/shop/previews/<city-slug>-<colour-slug>.webp

The filenames must match exactly what `js/customizer.js` builds, so this script
reads the city and colour lists out of that file instead of keeping its own copy —
one source, no drift.

    # what it will produce, no network
    python3 scripts/mockups.py --list-names

    # check a previews folder has the full set (names, not contents)
    python3 scripts/mockups.py --check assets/shop/previews

    # exercise the whole flow against a local stub: no token, no Printful
    python3 scripts/mockups.py --self-test

    # the real run (see docs/shop-mockups.md for the token and variant ids)
    PRINTFUL_TOKEN=... python3 scripts/mockups.py \\
        --product-id 71 \\
        --variants scripts/printful-variants.json \\
        --designs scripts/lockups/out \\
        --public-base https://puckd.blog/shop-lockups

Two facts about the Printful API that shape this script:

- **Mockup URLs expire after 72 hours.** Every image is downloaded the moment its
  task reports, never queued for a later pass.
- **Whether the API returns one image per variant or one per placement is not
  guaranteed.** If it returns a single image covering all eleven variants, there is
  no per-variant photo and any count it produced would be a lie. So the script
  checks that it got 11 *distinct* images per city and stops if it did not.

The design file must be a URL Printful can fetch, so the 31 city lockups are
rendered to PNG and published (the `--public-base` argument) before a run.
"""

from __future__ import annotations

import argparse
import io
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CUSTOMIZER = ROOT / "js" / "customizer.js"
OUT_DEFAULT = ROOT / "assets" / "shop" / "previews"
API = "https://api.printful.com"
TARGET_WIDTH = 900
EXPECTED_COUNT = 341  # 31 × 11, asserted at the end


# --- the catalogue, read from the front end so they cannot disagree -----------

def read_catalogue(path: Path = CUSTOMIZER) -> tuple[list[str], list[str]]:
    """Cities and colour names, parsed out of js/customizer.js."""
    text = path.read_text()
    cities_block = re.search(r"const cities = \[(.*?)\];", text, re.S)
    colours_block = re.search(r"const colours = \[(.*?)\];", text, re.S)
    if not cities_block or not colours_block:
        raise SystemExit(f"could not read the city/colour lists from {path}")
    cities = re.findall(r'"([^"]+)"', cities_block.group(1))
    colours = re.findall(r'name:\s*"([^"]+)"', colours_block.group(1))
    if not cities or not colours:
        raise SystemExit(f"empty city or colour list in {path}")
    return cities, colours


def slug(text: str) -> str:
    """The same rule as slug() in js/customizer.js. Keep the two identical: the
    filename is the whole contract between the shop page and these files."""
    s = re.sub(r"[^a-z0-9]+", "-", text.lower())
    return re.sub(r"^-+|-+$", "", s)


def expected_names(cities: list[str], colours: list[str]) -> list[str]:
    return [f"{slug(c)}-{slug(k)}.webp" for c in cities for k in colours]


# --- Printful -----------------------------------------------------------------

class Printful:
    def __init__(self, token: str, base: str = API):
        self.token = token
        self.base = base.rstrip("/")

    def _call(self, method: str, path: str, payload: dict | None = None) -> dict:
        data = json.dumps(payload).encode() if payload is not None else None
        req = urllib.request.Request(
            f"{self.base}{path}", data=data, method=method,
            headers={
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json",
                # The API wants a store id when the token is a store-level token;
                # an account-level token needs no header, so it is opt-in.
                **({"X-PF-Store-Id": os.environ["PRINTFUL_STORE_ID"]}
                   if os.environ.get("PRINTFUL_STORE_ID") else {}),
            },
        )
        for attempt in range(5):
            try:
                with urllib.request.urlopen(req, timeout=60) as r:
                    return json.loads(r.read())
            except urllib.error.HTTPError as e:
                if e.code == 429:  # the mockup endpoints are stricter than 120/min
                    wait = 5 * (attempt + 1)
                    print(f"    429 rate limited; waiting {wait}s", file=sys.stderr)
                    time.sleep(wait)
                    continue
                raise SystemExit(f"Printful {method} {path} -> {e.code} {e.read()[:300]!r}")
            except urllib.error.URLError as e:
                print(f"    network error ({e}); retrying in 5s", file=sys.stderr)
                time.sleep(5)
        raise SystemExit(f"Printful {method} {path}: gave up after 5 attempts")

    def create_task(self, product_id: int, variant_ids: list[int], design_url: str) -> str:
        body = {
            "variant_ids": variant_ids,
            "format": "jpg",
            "files": [{"placement": "front", "image_url": design_url}],
        }
        r = self._call("POST", f"/mockup-generator/create-task/{product_id}", body)
        return r["result"]["task_key"]

    def task(self, task_key: str) -> dict:
        return self._call("GET", f"/mockup-generator/task?task_key={task_key}")["result"]


def download(url: str, timeout: int = 120) -> bytes:
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return r.read()


def to_webp(raw: bytes, width: int = TARGET_WIDTH) -> bytes:
    from PIL import Image
    try:
        resample = Image.Resampling.LANCZOS   # Pillow >= 9.1
    except AttributeError:                    # older Pillow
        resample = Image.LANCZOS
    im = Image.open(io.BytesIO(raw)).convert("RGB")
    if im.width > width:
        im = im.resize((width, round(width * im.height / im.width)), resample)
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=82, method=6)
    return buf.getvalue()


def images_per_variant(result: dict) -> dict[int, str]:
    """variant id -> image url, from a completed task.

    Printful groups results by placement, and each group carries the variant ids it
    applies to. If a group covers several variants then those variants do not have
    their own image, and saying otherwise would be the one error that makes the
    whole report false.
    """
    mapping: dict[int, str] = {}
    for group in result.get("mockups", []):
        url = group.get("mockup_url")
        if not url:
            continue
        for vid in group.get("variant_ids", []):
            mapping.setdefault(vid, url)
    return mapping


# --- the run ------------------------------------------------------------------

def run(args: argparse.Namespace) -> int:
    cities, colours = read_catalogue()
    variant_ids = json.loads(Path(args.variants).read_text())
    if args.product_id is None:
        raise SystemExit("--product-id is required for a real run")

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    manifest_path = out / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}

    client = Printful(args.token)
    ids = [variant_ids[c] for c in colours]
    lockups = Path(args.designs)

    for n, city in enumerate(cities, 1):
        design = lockups / f"{slug(city)}.png"
        if not design.exists():
            raise SystemExit(f"missing lockup {design} — render the 31 lockups first")
        design_url = f"{args.public_base.rstrip('/')}/{slug(city)}.png"
        print(f"[{n}/{len(cities)}] {city}: creating mockup task")
        key = client.create_task(args.product_id, ids, design_url)

        # Poll no sooner than 10s, and give up rather than hammering.
        result = {}
        for _ in range(60):
            time.sleep(10)
            result = client.task(key)
            if result.get("status") in ("completed", "failed"):
                break
        if result.get("status") != "completed":
            raise SystemExit(f"{city}: task {key} did not complete ({result.get('status')})")

        per_variant = images_per_variant(result)
        got = [vid for vid in ids if vid in per_variant]
        if len(got) != len(colours):
            raise SystemExit(
                f"{city}: only {len(got)}/{len(colours)} variants came back with an image. "
                "Printful may be returning one mockup per placement instead of per "
                "variant — stop and check before claiming 341 photos."
            )
        distinct = len({per_variant[vid] for vid in ids})
        if distinct < len(colours):
            raise SystemExit(
                f"{city}: {distinct} distinct images for {len(colours)} variants — the "
                "colours are not being rendered separately, so these would be fake "
                "variants. Stop."
            )

        # Download immediately: mockup URLs expire after 72 hours.
        for colour in colours:
            vid = variant_ids[colour]
            name = f"{slug(city)}-{slug(colour)}.webp"
            (out / name).write_bytes(to_webp(download(per_variant[vid])))
            manifest[name] = {"city": city, "colour": colour, "variant_id": vid,
                              "task_key": key}
        manifest_path.write_text(json.dumps(manifest, indent=1, sort_keys=True))
        print(f"          {len(colours)} images written ({len(manifest)} so far)")

    produced = {n for n in manifest if (out / n).exists()}
    want = set(expected_names(cities, colours))
    missing = want - produced
    if len(produced) != EXPECTED_COUNT:
        raise SystemExit(f"{len(produced)} of {EXPECTED_COUNT} images present; "
                         f"{len(missing)} missing, e.g. {sorted(missing)[:3]}")
    total = sum((out / n).stat().st_size for n in produced)
    print(f"\n{len(produced)} images, {total / 1024 / 1024:.2f} MB as WebP")
    return 0


# --- self test: the whole flow against a local stub ---------------------------

def self_test() -> int:
    """Prove the plumbing without a token: a stub Printful serving 11 distinct
    images, downloaded, converted, named and counted for one city."""
    import http.server
    import threading

    colours_png = _stub_png(strings=True)

    class Handler(http.server.BaseHTTPRequestHandler):
        tasks: dict[str, int] = {}

        def log_message(self, *a):
            pass

        def do_POST(self):
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length))
            key = f"task{len(self.tasks) + 1}"
            self.tasks[key] = len(body["variant_ids"])
            payload = json.dumps({"result": {"task_key": key}}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def do_GET(self):
            if self.path.startswith("/mockup-generator/task"):
                key = self.path.split("task_key=")[1]
                n = self.tasks.get(key, 0)
                mockups = [{"mockup_url": f"http://127.0.0.1:{self.server.server_port}/img/{i}.png",
                            "variant_ids": [1000 + i]} for i in range(n)]
                payload = json.dumps({"result": {"status": "completed", "mockups": mockups}}).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
            elif self.path.startswith("/img/"):
                self.send_response(200)
                self.send_header("Content-Type", "image/png")
                self.send_header("Content-Length", str(len(colours_png)))
                self.end_headers()
                self.wfile.write(colours_png)
            else:
                self.send_response(404)
                self.end_headers()

    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{srv.server_port}"

    cities, colours = read_catalogue()
    ids = {c: 1000 + i for i, c in enumerate(colours)}
    client = Printful("self-test", base=base)
    key = client.create_task(71, list(ids.values()), f"{base}/design.png")
    result = client.task(key)
    per_variant = images_per_variant(result)
    names = []
    for colour in colours:
        vid = ids[colour]
        assert vid in per_variant, f"{colour} missing from the stub result"
        webp = to_webp(download(per_variant[vid]))
        names.append(f"{slug(cities[0])}-{slug(colour)}.webp")
        assert webp[:4] == b"RIFF" and webp[8:12] == b"WEBP", "not a WebP"
    srv.shutdown()

    assert len(per_variant) == len(colours), per_variant
    assert len(set(per_variant.values())) == len(colours), "stub images not distinct"
    print(f"self-test ok: {len(per_variant)} distinct variants, {len(names)} WebPs, "
          f"e.g. {names[0]}")
    return 0


def _stub_png(strings: bool = False) -> bytes:
    from PIL import Image, ImageDraw
    im = Image.new("RGB", (600, 580), (244, 244, 240))
    if strings:
        ImageDraw.Draw(im).rectangle([80, 240, 520, 340], fill=(23, 23, 23))
    buf = io.BytesIO()
    im.save(buf, "PNG")
    return buf.getvalue()


# --- checking names -----------------------------------------------------------

def check_names(directory: Path) -> int:
    cities, colours = read_catalogue()
    want = expected_names(cities, colours)
    have = {p.name for p in directory.glob("*.webp")}
    missing = [n for n in want if n not in have]
    extra = sorted(have - set(want))
    print(f"{len(want)} expected, {len(have)} present, {len(missing)} missing")
    if missing:
        print("  missing, first 5:", missing[:5])
    if extra:
        print("  not in the catalogue:", extra[:5])
    return 0 if not missing and not extra else 1


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--list-names", action="store_true", help="print the 341 filenames")
    ap.add_argument("--check", metavar="DIR", help="verify a previews folder against the catalogue")
    ap.add_argument("--self-test", action="store_true", help="run against a local stub")
    ap.add_argument("--product-id", type=int, default=None, help="Printful catalog product id")
    ap.add_argument("--variants", default=str(ROOT / "scripts" / "printful-variants.json"),
                    help="JSON map: colour name -> Printful variant id")
    ap.add_argument("--designs", default=str(ROOT / "scripts" / "lockups" / "out"))
    ap.add_argument("--public-base", default="", help="public URL the lockup PNGs are served from")
    ap.add_argument("--out", default=str(OUT_DEFAULT))
    args = ap.parse_args()

    if args.list_names:
        cities, colours = read_catalogue()
        for name in expected_names(cities, colours):
            print(name)
        return 0
    if args.check:
        return check_names(Path(args.check))
    if args.self_test:
        return self_test()

    args.token = os.environ.get("PRINTFUL_TOKEN", "")
    if not args.token:
        raise SystemExit("set PRINTFUL_TOKEN (Printful → Settings → Developers → API token). "
                         "Nothing is stored in the repo.")
    if not args.public_base:
        raise SystemExit("--public-base is required: Printful fetches the design from a URL")
    return run(args)


if __name__ == "__main__":
    sys.exit(main())