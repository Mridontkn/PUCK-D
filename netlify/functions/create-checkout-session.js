const cities = new Set([
  "Anaheim",
  "Boston",
  "Buffalo",
  "Calgary",
  "Raleigh",
  "Chicago",
  "Colorado",
  "Columbus",
  "Dallas",
  "Detroit",
  "Edmonton",
  "Miami",
  "LA",
  "Minneapolis",
  "Montreal",
  "Nashville",
  "New Jersey",
  "New York",
  "Ottawa",
  "Philadelphia",
  "Pittsburgh",
  "San Jose",
  "St. Louis",
  "Tampa",
  "Toronto",
  "Salt Lake City",
  "Vancouver",
  "Las Vegas",
  "Washington DC",
  "Winnipeg",
  "Seattle"
]);

const colours = new Set([
  "Black",
  "Navy",
  "Cranberry",
  "Spruce green",
  "Dark grey",
  "Green Camo",
  "Khaki",
  "Stone",
  "Pink",
  "Light blue",
  "White"
]);

const jsonResponse = (statusCode, data) => ({
  statusCode,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  },
  body: JSON.stringify(data)
});

function getSiteOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const isLocalHttp = url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1");

  if ((!isLocalHttp && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash) {
    return null;
  }

  return url.origin;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Use POST to start test checkout." });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey || !stripeSecretKey.startsWith("sk_test_")) {
    return jsonResponse(503, {
      error: "Test checkout is unavailable. Configure a Stripe test secret key."
    });
  }

  const siteOrigin = getSiteOrigin(process.env.SITE_URL);
  if (!siteOrigin) {
    return jsonResponse(503, {
      error: "Test checkout is unavailable. Configure SITE_URL."
    });
  }

  if (typeof event.body !== "string" || event.body.length === 0) {
    return jsonResponse(400, { error: "Choose a city and hat colour first." });
  }
  if (event.body.length > 2048) {
    return jsonResponse(413, { error: "Checkout request is too large." });
  }

  let selection;
  try {
    const body = event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf8")
      : event.body;
    selection = JSON.parse(body);
  } catch {
    return jsonResponse(400, { error: "Checkout request must be valid JSON." });
  }

  if (!selection || typeof selection !== "object" || Array.isArray(selection)) {
    return jsonResponse(400, { error: "Choose a city and hat colour first." });
  }

  const { city, colour } = selection;
  if (typeof city !== "string" || !cities.has(city) ||
      typeof colour !== "string" || !colours.has(colour)) {
    return jsonResponse(400, { error: "Choose a valid city and hat colour." });
  }

  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("payment_method_types[0]", "card");
  form.set("line_items[0][quantity]", "1");
  form.set("line_items[0][price_data][currency]", "cad");
  form.set("line_items[0][price_data][unit_amount]", "3999");
  form.set("line_items[0][price_data][product_data][name]", `${city} City Hat - ${colour}`);
  form.set("line_items[0][price_data][product_data][description]", "PUCK'D hat preview - test mode only");
  form.set("metadata[city]", city);
  form.set("metadata[colour]", colour);
  form.set("success_url", `${siteOrigin}/customize.html?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
  form.set("cancel_url", `${siteOrigin}/customize.html?checkout=cancelled`);

  let stripeResponse;
  try {
    stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${stripeSecretKey}`,
        "content-type": "application/x-www-form-urlencoded"
      },
      body: form.toString()
    });
  } catch (error) {
    console.error("Could not reach Stripe to create a test Checkout Session.", error);
    return jsonResponse(502, { error: "Stripe test checkout could not be reached. Try again." });
  }

  let stripeData;
  try {
    stripeData = await stripeResponse.json();
  } catch (error) {
    console.error("Stripe returned an unreadable Checkout Session response.", error);
    return jsonResponse(502, { error: "Stripe returned an invalid response. Try again." });
  }

  if (!stripeResponse.ok ||
      !stripeData ||
      typeof stripeData !== "object" ||
      typeof stripeData.url !== "string") {
    console.error(
      "Stripe test Checkout Session creation failed.",
      stripeData.error && stripeData.error.type,
      stripeData.error && stripeData.error.code
    );
    return jsonResponse(502, { error: "Stripe could not create a test checkout. Try again." });
  }

  return jsonResponse(200, { url: stripeData.url });
};
