(() => {
  const cities = [
    "Anaheim", "Boston", "Buffalo", "Calgary", "Raleigh", "Chicago", "Colorado",
    "Columbus", "Dallas", "Detroit", "Edmonton", "Miami", "LA", "Minneapolis",
    "Montreal", "Nashville", "New Jersey", "New York", "Ottawa", "Philadelphia",
    "Pittsburgh", "San Jose", "St. Louis", "Tampa", "Toronto", "Salt Lake City",
    "Vancouver", "Las Vegas", "Washington DC", "Winnipeg", "Seattle"
  ];
  const colours = [
    { name: "Black", hex: "#171717" },
    { name: "Navy", hex: "#182b4b" },
    { name: "Cranberry", hex: "#8f233f" },
    { name: "Spruce green", hex: "#174c3c" },
    { name: "Dark grey", hex: "#464a50" },
    { name: "Green Camo", hex: "#52634d" },
    { name: "Khaki", hex: "#b7a37a" },
    { name: "Stone", hex: "#c7c1b4" },
    { name: "Pink", hex: "#e6a3b1" },
    { name: "Light blue", hex: "#80b5d5" },
    { name: "White", hex: "#f4f4f0" }
  ];

  const citySelect = document.getElementById("citySelect");
  const colourSelect = document.getElementById("hatColourSelect");
  const countrySelect = document.getElementById("shippingCountry");
  const preview = document.getElementById("hatPreview");
  const fallback = document.getElementById("previewFallback");
  const fallbackText = document.getElementById("fallbackText");
  const previewStatus = document.getElementById("previewStatus");
  const checkoutButton = document.getElementById("startCheckout");
  const paymentStatus = document.getElementById("paymentStatus");
  const stripeModeNotice = document.getElementById("stripeModeNotice");
  const saveButton = document.getElementById("saveDesign");
  const saveMessage = document.getElementById("saveMessage");

  if (!citySelect || !colourSelect || !countrySelect || !checkoutButton) return;

  const slugify = (value) => value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  cities.forEach((city) => citySelect.add(new Option(city, city)));
  colours.forEach((colour) => colourSelect.add(new Option(colour.name, colour.name)));
  citySelect.value = "Calgary";
  colourSelect.value = "Navy";
  const isTestMode = new URLSearchParams(location.search).get("stripe_test") === "1";
  if (isTestMode) {
    stripeModeNotice.textContent = "Stripe test mode is active. Test payments do not charge a real card.";
    checkoutButton.textContent = "CHECK OUT WITH STRIPE TEST MODE";
  }

  function updatePreview() {
    const city = citySelect.value;
    const colour = colours.find((option) => option.name === colourSelect.value);
    if (!colour) return;

    const imagePath = `assets/shop/previews/${slugify(city)}-${slugify(colour.name)}.png`;
    preview.alt = `${city} hat in ${colour.name}`;
    preview.dataset.expectedPath = imagePath;
    preview.hidden = true;
    fallback.hidden = false;
    fallbackText.textContent = city.toUpperCase();
    fallback.style.setProperty("--hat-colour", colour.hex);
    previewStatus.textContent = `Loading ${city} in ${colour.name}...`;
    preview.src = imagePath;
  }

  const isCurrentImage = () => preview.currentSrc.endsWith(preview.dataset.expectedPath || "");
  preview.addEventListener("load", () => {
    if (!isCurrentImage()) return;
    preview.hidden = false;
    fallback.hidden = true;
    previewStatus.textContent = `Previewing ${citySelect.value} in ${colourSelect.value}.`;
  });
  preview.addEventListener("error", () => {
    if (!isCurrentImage()) return;
    preview.hidden = true;
    fallback.hidden = false;
    previewStatus.textContent = `Photo not added yet: ${preview.dataset.expectedPath}`;
  });
  citySelect.addEventListener("change", updatePreview);
  colourSelect.addEventListener("change", updatePreview);

  saveButton.addEventListener("click", () => {
    const savedDesign = {
      city: citySelect.value,
      colour: colourSelect.value,
      image: preview.dataset.expectedPath
    };
    try {
      localStorage.setItem("puckdHatPreview", JSON.stringify(savedDesign));
      saveMessage.textContent = `Saved your ${savedDesign.city} / ${savedDesign.colour} preview in this browser.`;
    } catch (error) {
      console.error("Could not save the hat preview.", error);
      saveMessage.textContent = "Could not save the preview in this browser.";
    }
  });

  checkoutButton.addEventListener("click", async () => {
    if (!countrySelect.value) {
      paymentStatus.textContent = "Choose Canada or the United States for shipping.";
      countrySelect.focus();
      return;
    }

    checkoutButton.disabled = true;
    paymentStatus.textContent = "Connecting to secure Stripe Checkout...";
    try {
      const functionName = isTestMode ? "create-checkout-test" : "create-checkout";
      const response = await fetch(`/.netlify/functions/${functionName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: citySelect.value,
          hatColour: colourSelect.value,
          shippingCountry: countrySelect.value
        })
      });

      let result;
      try {
        result = await response.json();
      } catch {
        throw new Error("Checkout service returned an invalid response. Please try again.");
      }
      if (!response.ok || !result || typeof result.url !== "string") {
        throw new Error(result.error || "Checkout could not be started.");
      }

      const checkoutUrl = new URL(result.url);
      if (checkoutUrl.origin !== "https://checkout.stripe.com") {
        throw new Error("Stripe returned an invalid checkout URL.");
      }
      location.assign(checkoutUrl.href);
    } catch (error) {
      console.error("Could not start Stripe Checkout.", error);
      paymentStatus.textContent = error.message || "Checkout could not be started. Please try again.";
      checkoutButton.disabled = false;
    }
  });

  const checkoutResult = new URLSearchParams(location.search).get("checkout");
  if (checkoutResult === "cancelled") {
    paymentStatus.textContent = "Checkout was cancelled; you were not charged.";
  }
  updatePreview();
})();
