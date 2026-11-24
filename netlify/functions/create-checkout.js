const Stripe = require('stripe');

const PRICE_CENTS = 3999;
const CURRENCY = 'cad';
const ALLOWED_ORIGINS = new Set([
  'https://puckd.blog',
  'https://www.puckd.blog'
]);
const ALLOWED_HATS = new Set(['White', 'Navy', 'Black', 'Red', 'Royal']);
const ALLOWED_THREADS = new Set(['Red', 'Black', 'White', 'Gold', 'Blue']);
const ALLOWED_FONTS = new Set(['college', 'block', 'serif']);

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
  const shippingRaw = process.env.PUCKD_SHIPPING_CAD;
  const shippingAmount = Number(shippingRaw);
  if (!shippingRaw || !Number.isFinite(shippingAmount) || shippingAmount < 0 || shippingAmount > 100) {
    return response(503, { error: 'Shipping is not configured. Set PUCKD_SHIPPING_CAD in Netlify (CAD dollars, flat rate for Canada).' });
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return response(400, { error: 'Invalid request body.' }); }

  const designText = String(body.designText || '').trim().toUpperCase();
  const hatColour = String(body.hatColour || '');
  const threadColour = String(body.threadColour || '');
  const fontStyle = String(body.fontStyle || '');
  if (!designText || designText.length > 14 || !/^[A-Z0-9 '&.-]+$/.test(designText)) {
    return response(400, { error: 'Enter 1–14 supported characters for the embroidery.' });
  }
  if (!ALLOWED_HATS.has(hatColour) || !ALLOWED_THREADS.has(threadColour) || !ALLOWED_FONTS.has(fontStyle)) {
    return response(400, { error: 'The selected hat options are not valid.' });
  }

  try {
    const stripe = new Stripe(secretKey);
    const siteUrl = (process.env.SITE_URL || 'https://puckd.blog').replace(/\/$/, '');
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      submit_type: 'pay',
      billing_address_collection: 'auto',
      shipping_address_collection: { allowed_countries: ['CA'] },
      line_items: [{
        quantity: 1,
        price_data: {
          currency: CURRENCY,
          unit_amount: PRICE_CENTS,
          product_data: {
            name: "PUCK'D Custom Yupoong 6007 Hat",
            description: `${designText} embroidery · ${hatColour} hat · ${threadColour} thread`
          }
        }
      }],
      shipping_options: [{
        shipping_rate_data: {
          type: 'fixed_amount',
          display_name: 'Shipping (Canada)',
          fixed_amount: { amount: Math.round(shippingAmount * 100), currency: CURRENCY },
          delivery_estimate: {
            minimum: { unit: 'business_day', value: 5 },
            maximum: { unit: 'business_day', value: 12 }
          }
        }
      }],
      phone_number_collection: { enabled: true },
      success_url: `${siteUrl}/order-success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/customize.html?checkout=cancelled`,
      metadata: {
        product_slug: 'custom-snapback',
        design_text: designText,
        hat_colour: hatColour,
        thread_colour: threadColour,
        font_style: fontStyle,
        quantity: '1'
      }
    });
    return response(200, { url: session.url });
  } catch (error) {
    console.error('Stripe Checkout creation failed:', error.message);
    return response(500, { error: 'We could not start checkout. Please try again.' });
  }
};
