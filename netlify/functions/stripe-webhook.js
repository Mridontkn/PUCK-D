const Stripe = require('stripe');

function reply(statusCode, body = 'ok') {
  return { statusCode, headers: { 'Content-Type': 'text/plain' }, body };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return reply(405, 'Method not allowed');

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!stripeKey || !stripeKey.startsWith('sk_live_') || !webhookSecret || !supabaseUrl || !serviceRoleKey) {
    console.error('Missing live Stripe or Supabase server environment variables.');
    return reply(500, 'Server configuration error');
  }

  const signature = event.headers?.['stripe-signature'] || event.headers?.['Stripe-Signature'];
  if (!signature) return reply(400, 'Missing Stripe signature');
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64')
    : Buffer.from(event.body || '', 'utf8');

  let stripeEvent;
  try {
    const stripe = new Stripe(stripeKey);
    stripeEvent = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return reply(400, 'Invalid signature');
  }

  if (stripeEvent.type !== 'checkout.session.completed') return reply(200, 'Event ignored');
  const session = stripeEvent.data.object;
  if (session.payment_status !== 'paid') return reply(200, 'Payment not complete');

  const meta = session.metadata || {};
  const shipping = session.shipping_details || {};
  const address = shipping.address || session.customer_details?.address || {};
  const order = {
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || null,
    customer_email: session.customer_details?.email || session.customer_email || null,
    customer_name: shipping.name || session.customer_details?.name || null,
    shipping_phone: session.customer_details?.phone || null,
    shipping_address_line1: address.line1 || null,
    shipping_address_line2: address.line2 || null,
    shipping_city: address.city || null,
    shipping_region: address.state || null,
    shipping_postal_code: address.postal_code || null,
    shipping_country: address.country || null,
    product_slug: meta.product_slug || 'custom-snapback',
    design_text: meta.design_text || '',
    hat_colour: meta.hat_colour || null,
    thread_colour: meta.thread_colour || null,
    font_style: meta.font_style || null,
    quantity: Number(meta.quantity || 1),
    subtotal_cents: session.amount_subtotal || 0,
    shipping_cents: session.shipping_cost?.amount_total || 0,
    total_cents: session.amount_total || 0,
    discount_cents: 0,
    creator_commission_cents: 0,
    currency: (session.currency || 'cad').toUpperCase(),
    payment_status: 'paid',
    fulfillment_status: 'not_submitted',
    paid_at: new Date((stripeEvent.created || Math.floor(Date.now() / 1000)) * 1000).toISOString()
  };

  if (!order.design_text || order.design_text.length > 14 || !order.customer_email) {
    console.error('Paid session missing required order metadata:', session.id);
    return reply(500, 'Order metadata incomplete');
  }

  try {
    const endpoint = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/shop_orders?on_conflict=stripe_checkout_session_id`;
    const dbResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Prefer': 'resolution=ignore-duplicates,return=minimal'
      },
      body: JSON.stringify(order)
    });
    if (!dbResponse.ok) {
      const detail = await dbResponse.text();
      console.error('Supabase order insert failed:', dbResponse.status, detail);
      return reply(500, 'Could not record paid order');
    }
    return reply(200, 'Order recorded');
  } catch (err) {
    console.error('Order persistence failed:', err.message);
    return reply(500, 'Could not record paid order');
  }
};
