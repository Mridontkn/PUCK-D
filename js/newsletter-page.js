/* Newsletter page: early-trigger scroll reveals. Signup itself lives in newsletter.js. */
(function () {
    const els = document.querySelectorAll('.nlp-reveal');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!els.length || reduce || !('IntersectionObserver' in window)) return;

    document.body.classList.add('nlp-js');
    const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
            if (!e.isIntersecting) return;
            e.target.classList.add('in');
            io.unobserve(e.target);
        });
    }, { rootMargin: '0px 0px 15% 0px', threshold: 0 });

    els.forEach((el) => io.observe(el));
})();
