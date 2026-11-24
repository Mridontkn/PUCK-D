# City hat photos

One photo per city × colour: `assets/shop/previews/<city-slug>-<colour-slug>.webp`.

31 cities × 11 colours = **341 files**. `js/customizer.js` builds the path from the
selection (`slug()` lowercases, collapses anything that is not a letter or digit to `-`),
so the filename must match exactly:

| Selection | File |
|---|---|
| St. Louis / Spruce green | `st-louis-spruce-green.webp` |
| Washington DC / Green Camo | `washington-dc-green-camo.webp` |
| LA / Black | `la-black.webp` |

- **WebP, 900 px wide.** At the sample's 1472×1420 a PNG is ~365 KB and a WebP ~10 KB,
  so 341 PNGs would be ~120 MB of deploy against ~3.4 MB. PNG masters stay out of the repo.
- **A missing file is not an error.** The page falls back to the single sample
  (`assets/shop/hat-preview.png`) and says so; if that is missing too it shows the
  illustration. So this folder can fill up gradually without breaking the shop.
- **Provenance.** These are Printful mockups, generated from the shop's own design
  files. Printful's Terms §4.6 allows mockups to advertise and sell *Printful* products
  only — if fulfilment ever moves to another supplier these images stop being licensed.
  `docs/shop-mockups.md` has the generator and the constraint.
