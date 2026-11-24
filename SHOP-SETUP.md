# PUCK'D Shop — starter integration

This package adds a first-stage shop and hat designer to the existing static PUCK'D site.
It preserves the existing articles, ticker, Supabase client and other pages.

## Files added
- `shop.html` — shop landing page
- `customize.html` — first hat designer page
- `css/shop.css` — isolated shop styles
- `js/shop.js` — shop page behaviour
- `js/customizer.js` — city/colour selection, variant-photo preview and browser-local save
- `netlify/functions/create-checkout-session.js` — server-side Stripe test Checkout Session creation
- `supabase/shop-schema.sql` — starter tables for products, creators and orders
- `assets/shop/previews/` — location for all 341 city/colour preview photos

## File changed
- `navbar.html` — adds Shop links to desktop and mobile navigation

## Stripe Checkout: test mode only
The hat designer includes a Stripe-hosted test checkout for the selected city and colour. It always charges the test-mode amount of CAD $39.99 and the server rejects Stripe live keys. Test mode does not collect shipping, calculate tax, record an order or submit fulfillment. The success redirect is not proof of payment and must not be used to fulfill orders.

To enable test checkout:
1. Add `STRIPE_SECRET_KEY` as a Netlify environment variable using a Stripe **test** secret key (`sk_test_...`).
2. Set `SITE_URL` to the site origin, such as `https://puckd.blog` (or `http://localhost:8888` when using `netlify dev`).
3. Run locally with Netlify Dev or deploy the functions to Netlify. The checkout function is `netlify/functions/create-checkout-session.js`.

Do not put Stripe keys in browser JavaScript or commit them to the repository. Never use a live secret key with this test-only checkout.

## Add the 341 variant preview photos
Add one image for each city and colour combination to `assets/shop/previews/`. Use PNG files named `<city-slug>-<colour-slug>.png`; for example:

- `anaheim-black.png`
- `calgary-navy.png`
- `washington-dc-light-blue.png`
- `st-louis-spruce-green.png`

Convert city and colour names to lowercase and replace spaces or punctuation with hyphens. The designer uses the selected city and colour to load the matching image. Each photo should show the finished city lettering and hat colour; no lettering is added on top of the photo. Until a photo is added, the preview shows a colour-matched placeholder and the expected filename.

The 31 cities are Anaheim, Boston, Buffalo, Calgary, Raleigh, Chicago, Colorado, Columbus, Dallas, Detroit, Edmonton, Miami, LA, Minneapolis, Montreal, Nashville, New Jersey, New York, Ottawa, Philadelphia, Pittsburgh, San Jose, St. Louis, Tampa, Toronto, Salt Lake City, Vancouver, Las Vegas, Washington DC, Winnipeg and Seattle.

The 11 colours are Black, Navy, Cranberry, Spruce green, Dark grey, Green Camo, Khaki, Stone, Pink, Light blue and White.

## Deploy
Upload the added files and the modified `navbar.html` to the root of the existing Netlify site, preserving the folder structure. Existing pages do not need to be replaced.

URLs after deploy:
- `https://puckd.blog/shop.html`
- `https://puckd.blog/customize.html`

## Supabase schema
Review `supabase/shop-schema.sql`, then run it in Supabase SQL Editor. It creates tables with Row Level Security enabled. Creator and order data intentionally have no public read/write policies.

Never put a Supabase service-role key, Stripe secret key, Printful API token or webhook secret in browser JavaScript or in the public repository.

## Before accepting live orders
We still need to implement and test:
1. Stripe live-mode configuration and webhook signature verification with paid-order recording.
2. Server-side creator-code validation and commission ledger.
3. Shipping calculation/collection based on the actual Printful destination quote.
4. Printful fulfillment submission and handling of custom embroidery files.
5. Refund, tax, privacy and customer support flows.

Do not accept live orders until those steps are complete and a real end-to-end test order has succeeded.
