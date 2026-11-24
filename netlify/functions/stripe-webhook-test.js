const Stripe = require('stripe');

function reply(statusCode, body = 'ok') {
  return { statusCode, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }, body };
}

// TEST-ONLY endpoint. It verifies Stripe test webhook delivery but deliberately
// does not write test purchases into the live shop_orders table.
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return reply(405, 'Method not allowed');

  const stripeKey = process.env.STRIPE_TEST_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_TEST_WEBHOOK_SECRET;
  if (!stripeKey || !stripeKey.startsWith('sk_test_') || !webhookSecret) {
    console.error('Missing Stripe test-mode environment variables.');
    return reply(500, 'Test webhook configuration error');
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
    console.error('Test webhook signature verification failed:', err.message);
    return reply(400, 'Invalid signature');
  }

  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;
    console.log('TEST PAYMENT RECEIVED', JSON.stringify({
      session_id: session.id,
      payment_status: session.payment_status,
      amount_total: session.amount_total,
      currency: session.currency,
      customer_email: session.customer_details?.email || null,
      metadata: session.metadata || {}
    }));
  }

  return reply(200, 'Test event verified; no live order was created');
};
