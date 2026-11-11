// About / Our Team: roster counts, role highlight filter, scroll reveals.
(function () {
  const roster = document.querySelector('.roster');
  if (!roster) return;
  const cards = Array.from(roster.querySelectorAll('.roster-card'));
  const has = (card, tag) => (card.dataset.tags || '').split(/\s+/).includes(tag);
  const count = (tag) => (tag === 'all' ? cards.length : cards.filter((c) => has(c, tag)).length);

  // Hero stats + filter button counts stay in sync with the markup.
  document.querySelectorAll('[data-count]').forEach((el) => {
    el.textContent = count(el.dataset.count);
  });

  const buttons = Array.from(document.querySelectorAll('.lf-btn'));
  buttons.forEach((btn) => {
    const n = document.createElement('span');
    n.className = 'lf-count';
    n.setAttribute('aria-hidden', 'true');
    n.textContent = count(btn.dataset.filter);
    btn.appendChild(n);

    btn.addEventListener('click', () => {
      const tag = btn.dataset.filter;
      buttons.forEach((b) => {
        const on = b === btn;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', String(on));
      });
      roster.classList.toggle('is-filtering', tag !== 'all');
      cards.forEach((c) => c.classList.toggle('is-match', tag === 'all' || has(c, tag)));
    });
  });

  // Scroll reveal: quick, small stagger per batch, triggers early.
  const targets = [document.querySelector('.about-stats'), document.querySelector('.lineup-head'), ...cards].filter(Boolean);
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const io = new IntersectionObserver((entries) => {
    let batch = 0;
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.style.setProperty('--d', batch++);
      entry.target.classList.add('in');
      io.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px 15% 0px' });
  targets.forEach((t) => io.observe(t));
})();
