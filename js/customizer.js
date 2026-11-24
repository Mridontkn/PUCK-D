(() => {
  const textInput = document.getElementById('designText');
  if (!textInput) return;
  const fallbackText = document.getElementById('fallbackText');
  const charCount = document.getElementById('charCount');
  const hatName = document.getElementById('hatColourName');
  const threadName = document.getElementById('threadColourName');
  const shippingCountry = document.getElementById('shippingCountry');
  const canvas = document.getElementById('hatCanvas');
  const ctx = canvas.getContext('2d');
  const state = { text: textInput.value, hat: '#ffffff', thread: '#c92732', font: 'college', hatName: 'White', threadName: 'Red' };
  const fontMap = { college: '900 112px Georgia, serif', block: '900 112px Arial Black, Arial, sans-serif', serif: '900 112px Georgia, serif' };
  let baseImage = new Image();
  let imageReady = false;
  function loadHatImage(colourName) {
    imageReady = false; canvas.style.display = 'none';
    const slug = colourName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const nextImage = new Image();
    nextImage.onload = () => { baseImage = nextImage; imageReady = true; canvas.style.display = 'block'; document.getElementById('previewFallback').style.display = 'none'; draw(); };
    nextImage.onerror = () => { imageReady = false; canvas.style.display = 'none'; document.getElementById('previewFallback').style.display = 'flex'; };
    nextImage.src = `assets/shop/yupoong-6007-${slug}-front.png`;
  }
  loadHatImage(state.hatName);
  function draw() {
    if (!imageReady) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(baseImage, 0, 0, canvas.width, canvas.height);
    const clean = state.text.trim().toUpperCase().slice(0,14);
    if (!clean) return;
    const x = canvas.width * 0.5, y = canvas.height * 0.555;
    const maxWidth = canvas.width * 0.64;
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let size = 112; ctx.font = fontMap[state.font];
    while (ctx.measureText(clean).width > maxWidth && size > 36) { size -= 2; ctx.font = `900 ${size}px ${state.font === 'block' ? 'Arial Black, Arial, sans-serif' : 'Georgia, serif'}`; }
    // Preview-only shadow/outline to suggest raised embroidery; final stitches come from the supplier.
    ctx.lineJoin = 'round'; ctx.lineWidth = 7; ctx.strokeStyle = '#171717'; ctx.strokeText(clean, x + 5, y + 5, maxWidth);
    ctx.fillStyle = state.thread; ctx.fillText(clean, x, y, maxWidth);
    ctx.restore();
  }
  function update() {
    state.text = textInput.value; charCount.textContent = state.text.length; fallbackText.textContent = state.text.toUpperCase() || 'YOUR TEXT';
    fallbackText.style.color = state.thread; fallbackText.style.textShadow = `3px 3px ${state.thread === '#111111' ? '#888' : '#111'}`;
    const fallbackCrown = document.querySelector('.fallback-crown');
    const fallbackBrim = document.querySelector('.fallback-brim');
    if (fallbackCrown) fallbackCrown.style.background = state.hat;
    if (fallbackBrim) fallbackBrim.style.background = state.hat;
    draw();
  }
  textInput.addEventListener('input', update);
  document.querySelectorAll('.font-option').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.font-option').forEach(b => b.classList.toggle('selected', b === btn)); state.font = btn.dataset.font; draw();
  }));
  function bindSwatches(id, key, nameKey, labelEl) {
    document.querySelectorAll(`#${id} .swatch`).forEach(btn => btn.addEventListener('click', () => {
      document.querySelectorAll(`#${id} .swatch`).forEach(b => b.classList.toggle('selected', b === btn));
      state[key] = btn.dataset.colour; state[nameKey] = btn.dataset.name; labelEl.textContent = state[nameKey];
      if (key === 'hat') loadHatImage(state.hatName);
      update();
    }));
  }
  bindSwatches('hatSwatches', 'hat', 'hatName', hatName);
  bindSwatches('threadSwatches', 'thread', 'threadName', threadName);
  document.getElementById('saveDesign').addEventListener('click', async () => {
    const button = document.getElementById('saveDesign');
    const message = document.getElementById('saveMessage');
    const designText = state.text.trim().toUpperCase();
    if (!designText) { message.textContent = 'Enter lettering before checkout.'; return; }

    button.disabled = true;
    button.textContent = 'CONNECTING TO SECURE CHECKOUT…';
    const selectedCountry = shippingCountry ? shippingCountry.value : '';
    if (!['CA', 'US'].includes(selectedCountry)) {
      message.textContent = 'Choose Canada or the United States for shipping.';
      button.disabled = false;
      button.textContent = 'CHECK OUT WITH STRIPE';
      return;
    }
    message.textContent = selectedCountry === 'CA'
      ? 'Preparing checkout · C$10.00 shipping to Canada.'
      : 'Preparing checkout · C$5.70 shipping to the United States.';
    try {
      const testMode = new URLSearchParams(window.location.search).get('stripe_test') === '1';
      const checkoutFunction = testMode ? 'create-checkout-test' : 'create-checkout';
      const result = await fetch(`/.netlify/functions/${checkoutFunction}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          designText,
          hatColour: state.hatName,
          threadColour: state.threadName,
          fontStyle: state.font,
          shippingCountry: shippingCountry ? shippingCountry.value : ''
        })
      });
      const data = await result.json().catch(() => ({}));
      if (!result.ok || !data.url) throw new Error(data.error || 'Checkout could not be started.');
      window.location.assign(data.url);
    } catch (error) {
      message.textContent = error.message || 'Something went wrong. Please try again.';
      button.disabled = false;
      button.textContent = 'CHECK OUT WITH STRIPE';
    }
  });
  update();
})();
