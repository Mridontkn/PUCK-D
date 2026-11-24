# PUCK'D Shop — starter integration

This package adds a first-stage shop and hat designer to the existing static PUCK'D site.
It preserves the existing articles, ticker, Supabase client and other pages.

## Files added
- `shop.html` — shop landing page
- `customize.html` — first hat designer page
- `css/shop.css` — isolated shop styles
- `js/shop.js` — shop page behaviour
- `js/customizer.js` — city/colour selection, variant-photo preview and browser-local save
- `netlify/functions/create-checkout.js` — live Stripe Checkout Session creation
- `netlify/functions/create-checkout-test.js` — test Stripe Checkout Session creation
- `netlify/functions/stripe-webhook.js` — verifies live payments and records paid orders
- `netlify/functions/stripe-webhook-test.js` — verifies test events without recording live orders
- `supabase/shop-schema.sql` — starter tables for products, creators and orders
- `assets/shop/hat-preview.png` — single sample hat photo shown for now

## File changed
- `navbar.html` — adds Shop links to desktop and mobile navigation

## Stripe Checkout
The designer offers the selected city and hat colour through Stripe Checkout. The server validates selections and sets the price to CAD $39.99. Checkout adds fixed shipping of C$10.00 for Canada or C$5.70 for the United States.

The normal checkout button uses the live endpoint. For test payments, open the designer with `?stripe_test=1`; the test endpoint accepts Stripe test keys only. Use Stripe's test card details in test mode. Test payments are not saved to the live orders table.

Configure these Netlify environment variables:

- Live: `STRIPE_SECRET_KEY` (`sk_live_...`), `STRIPE_WEBHOOK_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- Test: `STRIPE_TEST_SECRET_KEY` (`sk_test_...`) and `STRIPE_TEST_WEBHOOK_SECRET`.
- Both modes: `SITE_URL`, set to the canonical site origin.

Configure Stripe webhooks to call `/.netlify/functions/stripe-webhook` for live events and `/.netlify/functions/stripe-webhook-test` for test events. The live handler verifies Stripe signatures and stores completed paid orders in Supabase; the test handler only verifies/logs test events. A return to the success page is not proof that payment or order recording completed.

For local test checkout, run with Netlify Dev and set `STRIPE_TEST_SECRET_KEY`; the test endpoint permits localhost origins and redirects back to the local site. Never expose a live secret key in browser code or commit any Stripe credentials.

## Add one sample hat photo
For now, add one sample image at `assets/shop/hat-preview.png`. Both the shop card and designer use the same image. City and colour selections are still sent to Stripe, but the display photo stays the same and is not a precise preview of the selected variation. If the photo is missing, the designer shows a hat illustration.

The 341 individual city/colour photos can be added later if you want the preview to change for every variation.

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

## Before fulfilling and scaling live orders
Verify the production Stripe and Supabase environment variables, complete an end-to-end live test order, and confirm the webhook records it correctly. Still needed before automated fulfillment:
1. Server-side creator-code validation and commission ledger.
2. Confirm shipping rates against actual Printful destination quotes.
3. Printful fulfillment submission for the selected city/colour product photos.
4. Refund, tax, privacy and customer support flows.

Do not treat the success redirect as order confirmation; use the verified webhook and recorded paid order as the source of truth.
