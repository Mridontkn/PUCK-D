#!/usr/bin/env python3
"""Render the 31 city lockups from one template.

The shop's CALGARY is a bespoke treatment, not a font: heavy condensed caps, a red
fill, and a thick black slab extruded up and to the right whose stepped top edge
reads as a skyline. Every city has to land in the same visual weight and the same
panel width.

**Fit by measuring, not by stretching.** SVG's `textLength` forces a string to an
exact width by squeezing or stretching its glyphs. That is fine for a name near the
target length and grotesque away from it — "LA" becomes two stretched slabs and
"Washington DC" gets crushed. So the fit is measured: render once at a reference
size, measure the ink, set the size by the ratio. Text width scales linearly with
font size, so one measurement gives the exact size, and every city keeps its own
proportions at the same width.

    python3 scripts/lockups.py                      # SVG only (heuristic size)
    python3 scripts/lockups.py --png                 # SVG + 2x PNG, fitted by measurement
    python3 scripts/lockups.py --one calgary --png   # one city, for checking

The city list comes from js/customizer.js, so this and the shop page cannot disagree
about what the 31 cities are. Files are <city-slug>.png, which is what
scripts/mockups.py fetches.

Embroidery note: Printful renders the stitch texture; the design file stays flat. The
slab is a solid shape built from stacked copies, which survives embroidering — but its
finest step is ~2 units at this size, so scale down before a real machine if the thread
count matters.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from mockups import read_catalogue, slug  # noqa: E402  one catalogue, one slug rule

OUT = ROOT / "scripts" / "lockups" / "out"
CANVAS_W, CANVAS_H = 1200, 430
PANEL = 1120              # the ink width every city is fitted to
BASELINE = 330
REF_SIZE = 300            # the size the fit is measured at
MIN_SIZE, MAX_SIZE = 70, 320
RED = "#c9231f"           # the fill in the sample photo, measured off it
BLACK = "#171717"         # the slab
STEPS = 22                # copies between the fill and the slab's far edge
REL_STEP = 2.2 / REF_SIZE # per-copy offset, as a fraction of the type size: the
                          # extrusion stays ~16% of the letters whatever their size,
                          # so a long name's slab cannot float free of its letters
FONT = "Anton, Impact, Haettenschweiler, 'Arial Narrow', sans-serif"


def svg_for(city: str, size: int, width: int = CANVAS_W) -> str:
    text = city.upper()
    cx = width // 2
    step = size * REL_STEP
    slab = "".join(
        f'<text x="{cx + i * step:.1f}" y="{BASELINE - i * step:.1f}" '
        f'text-anchor="middle">{text}</text>'
        for i in range(STEPS, 0, -1)
    )
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{CANVAS_H}"
     viewBox="0 0 {width} {CANVAS_H}" style="background:transparent">
  <g font-family="{FONT}" font-size="{size}" font-weight="700" fill="{BLACK}"
     stroke="{BLACK}" stroke-width="{size * 8 / REF_SIZE:.1f}" stroke-linejoin="round">
    {slab}
  </g>
  <text x="{cx}" y="{BASELINE}" text-anchor="middle" font-family="{FONT}"
        font-size="{size}" font-weight="700" fill="{RED}">{text}</text>
</svg>
"""


def render(svg_text: str, png_path: Path, width: int = CANVAS_W, scale: int = 2) -> bool:
    """Rasterise with the system Chrome; False if it is missing."""
    with tempfile.NamedTemporaryFile("w", suffix=".svg", delete=False) as f:
        f.write(svg_text)
        svg_path = Path(f.name)
    try:
        subprocess.run(
            ["google-chrome", "--headless", "--disable-gpu", "--hide-scrollbars",
             # no white page behind the design: Printful needs the lockup on nothing
             "--default-background-color=00000000",
             f"--window-size={width},{CANVAS_H}",
             f"--force-device-scale-factor={scale}",
             f"--screenshot={png_path}", svg_path.as_uri()],
            check=True, capture_output=True, timeout=90,
        )
        return png_path.exists()
    except (FileNotFoundError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return False
    finally:
        svg_path.unlink(missing_ok=True)


def ink_width(png_path: Path) -> int:
    """Ink width in CSS pixels (the PNG is rendered at 2x)."""
    from PIL import Image
    alpha = Image.open(png_path).getchannel("A")
    box = alpha.getbbox()
    return 0 if box is None else (box[2] - box[0]) // 2


def fitted_size(city: str, workdir: Path) -> int | None:
    """Measure at REF_SIZE on a canvas wide enough not to clip, then scale to PANEL.
    None when there is no renderer (the caller falls back to the heuristic)."""
    probe = workdir / "probe.png"
    if not render(svg_for(city, REF_SIZE, width=4000), probe, width=4000):
        return None
    w = ink_width(probe)
    if w <= 0:
        return None
    return max(MIN_SIZE, min(MAX_SIZE, round(REF_SIZE * PANEL / w)))


def size_for(text: str) -> int:
    """Fallback with no renderer: assume ~0.52 em per character."""
    return max(MIN_SIZE, min(MAX_SIZE, round(PANEL / (0.52 * max(len(text), 1)))))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--png", action="store_true", help="also rasterise (needs google-chrome)")
    ap.add_argument("--one", help="render just this city (by name or slug)")
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args()

    cities, _colours = read_catalogue()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    if args.one:
        wanted = slug(args.one)
        cities = [c for c in cities if slug(c) == wanted or c.lower() == args.one.lower()]
        if not cities:
            raise SystemExit(f"no city matching {args.one!r}")

    made, pngs, sizes = [], 0, {}
    with tempfile.TemporaryDirectory() as td:
        workdir = Path(td)
        for city in cities:
            name = slug(city)
            size = (fitted_size(city, workdir) if args.png else None) or size_for(city.upper())
            sizes[name] = size
            (out / f"{name}.svg").write_text(svg_for(city, size))
            made.append(name)
            if args.png:
                if render(svg_for(city, size), out / f"{name}.png"):
                    pngs += 1
                else:
                    print(f"  {name}: no PNG (google-chrome missing); SVG written", file=sys.stderr)

    print(f"{len(made)} lockups in {out}")
    if args.png:
        if not pngs:
            print("  no PNGs: install google-chrome, or ship the SVGs", file=sys.stderr)
            return 1
        widths = sorted(ink_width(out / f"{n}.png") for n in made)
        print(f"{pngs} PNGs at 2x; ink width {widths[0]}–{widths[-1]}px (target {PANEL}); "
              f"type size {min(sizes.values())}–{max(sizes.values())}")
        if pngs < len(made):
            print("  some cities have no PNG — mockups.py needs one PNG per city", file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())