# City hat photos: 341 images from Printful mockups

The shop sells 31 cities × 11 colours = **341 combinations**. Each one gets its own
photo at `assets/shop/previews/<city-slug>-<colour-slug>.webp`, and the customizer
builds that path from the selection (with the single sample as the fallback, so the
shop works while the folder fills up).

Everything below the token is built and tested. The token is the only blocker.

## What is already here

| File | What it does | State |
|---|---|---|
| `scripts/mockups.py` | Printful mockup tasks → download → WebP 900px → the 341 names, with a manifest | written; `--self-test` proves the whole flow against a local stub |
| `scripts/lockups.py` | the 31 city lockups from one template (measured fit, so no city is stretched) | written; renders 31 PNGs with Chrome |
| `js/customizer.js` | builds the preview path from the selection, falls back to the sample, then to the illustration | patched and checked in a browser |
| `assets/shop/previews/README.md` | the naming contract | updated to `.webp` |

## Run it

```bash
# 1. the design files (one per city, transparent PNG, 2x)
python3 scripts/lockups.py --png            # -> scripts/lockups/out/<city-slug>.png, 31 files

# 2. what it will produce — no network, no token
python3 scripts/mockups.py --list-names     # 341 filenames

# 3. prove the pipeline without Printful
python3 scripts/mockups.py --self-test

# 4. the real run
PRINTFUL_TOKEN=... python3 scripts/mockups.py \
    --product-id <id> \
    --variants scripts/printful-variants.json \
    --designs scripts/lockups/out \
    --public-base https://puckd.blog/shop-lockups

# 5. check the folder against the catalogue
python3 scripts/mockups.py --check assets/shop/previews
```

## What the owner has to supply

1. **A Printful account and a private API token** (Developer Portal). It goes in a
   Netlify environment variable and a local `.env` — never in the repo.
2. **Which catalog product is being sold**, so the variant ids are right for the
   region. `scripts/printful-variants.json.example` is the shape: colour name →
   variant id. The script refuses to run until every one of the 11 colours maps.

The 11 colour names match the Yupoong 6245CM dad-hat palette, which is why Printful
is the intended path rather than a guess — but the ids still have to be confirmed
against the account's own region, because a catalog id is not portable.

## Two API facts that shape the script

- **Mockup URLs expire after 72 hours.** Every image is downloaded the moment its
  task reports; nothing is queued for a later pass.
- **Per-variant mockups are not guaranteed.** If Printful returns one image covering
  all eleven variants, there is no per-colour photo and any count would be a lie. The
  script checks for **11 distinct images per city** and stops rather than naming one
  photo eleven times. That check is the reason to trust a "341" from this script.

Rate limits: 120 req/min generally, stricter on the mockup endpoints, exact figure
unpublished — the script backs off on 429 instead of guessing.

## Why not recolour the sample

Tested and rejected: the city name is embroidered *into* the photo, so there is no
blank base underneath and masking erases the panel. Recoloured fakes are not product
shots and must not ship as ones.

## Legal

Printful's Terms §4.6: mockups may be used only to advertise and sell Printful
products. That is fine while fulfilment stays with Printful. **If the shop ever
switches supplier, these 341 images stop being licensed for use** and have to be
re-made or removed. Worth remembering before anyone builds a campaign on them.

## The design side, priced honestly

The photo count is mechanical; the **design** is 31 city lockups, not 341 images. The
existing CALGARY is a bespoke treatment — heavy condensed caps, red fill, a thick
black slab extruded up and to the right whose stepped top edge reads as a skyline —
not a font. The template here reproduces the construction (measured fit so every name
lands the same width and weight), and a designer can refine the letterforms.

So when someone offers $10 for "all the hats": the deliverable is 31 designs plus 341
derived images, and the 31 are the work.