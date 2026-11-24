const Stripe = require('stripe');

const PRICE_CENTS = 3999;
const CURRENCY = 'cad';
const ALLOWED_ORIGINS = new Set([
  'https://puckd.blog',
  'https://www.puckd.blog'
]);
const ALLOWED_CITIES = new Set([
  'Anaheim', 'Boston', 'Buffalo', 'Calgary', 'Raleigh', 'Chicago', 'Colorado',
  'Columbus', 'Dallas', 'Detroit', 'Edmonton', 'Miami', 'LA', 'Minneapolis',
  'Montreal', 'Nashville', 'New Jersey', 'New York', 'Ottawa', 'Philadelphia',
  'Pittsburgh', 'San Jose', 'St. Louis', 'Tampa', 'Toronto', 'Salt Lake City',
  'Vancouver', 'Las Vegas', 'Washington DC', 'Winnipeg', 'Seattle'
]);
const ALLOWED_HAT_COLOURS = new Set([
  'Black', 'Navy', 'Cranberry', 'Spruce green', 'Dark grey', 'Green Camo',
  'Khaki', 'Stone', 'Pink', 'Light blue', 'White'
]);

function response(statusCode, payload) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(payload)
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return response(405, { error: 'Method not allowed.' });

  const origin = event.headers?.origin || event.headers?.Origin;
  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return response(403, { error: 'This checkout request did not come from PUCK\'D.' });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey || !secretKey.startsWith('sk_live_')) {
    return response(503, { error: 'Live Stripe is not configured. Add your live secret key in Netlify environment variables.' });
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return response(400, { error: 'Invalid request body.' }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return response(400, { error: 'Choose a city and hat colour.' });
  }

  const city = typeof body.city === 'string' ? body.city : '';
  const hatColour = typeof body.hatColour === 'string' ? body.hatColour : '';
  const shippingCountry = typeof body.shippingCountry === 'string' ? body.shippingCountry : '';
  const shippingByCountry = { CA: 1000, US: 570 };
  const shippingAmountCents = shippingByCountry[shippingCountry];
  if (!Number.isInteger(shippingAmountCents)) {
    return response(400, { error: 'Choose Canada or the United States for shipping.' });
  }
  if (!ALLOWED_CITIES.has(city) || !ALLOWED_HAT_COLOURS.has(hatColour)) {
    return response(400, { error: 'Choose a valid city and hat colour.' });
  }

  try {
    const stripe = new Stripe(secretKey);
    const siteUrl = (process.env.SITE_URL || 'https://puckd.blog').replace(/\/$/, '');
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      submit_type: 'pay',
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      shipping_address_collection: { allowed_countries: [shippingCountry] },
      line_items: [{
        quantity: 1,
        price_data: {
          currency: CURRENCY,
          unit_amount: PRICE_CENTS,
          product_data: {
            name: `PUCK'D City Hat — ${city}`,
            description: `${city} embroidery · ${hatColour} hat`
          }
        }
      }],
      shipping_options: [{
        shipping_rate_data: {
          type: 'fixed_amount',
          display_name: shippingCountry === 'CA' ? 'Shipping (Canada)' : 'Shipping (United States)',
          fixed_amount: { amount: shippingAmountCents, currency: CURRENCY }
        }
      }],
      phone_number_collection: { enabled: true },
      success_url: `${siteUrl}/order-success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/customize.html?checkout=cancelled`,
      metadata: {
        product_slug: 'city-hat',
        design_text: city.toUpperCase(),
        city,
        hat_colour: hatColour,
        thread_colour: '',
        font_style: 'city-variant',
        shipping_country_selected: shippingCountry,
        quantity: '1'
      }
    });
    return response(200, { url: session.url });
  } catch (error) {
    console.error('Stripe Checkout creation failed:', error.message);
    return response(500, { error: 'We could not start checkout. Please try again.' });
  }
};
