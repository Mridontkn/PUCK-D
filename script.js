/* Shared helpers used on every public page (homepage logic lives in home.js). */

let TICKER = [];
var _tickerActive = false;
// `var` so other scripts (articles.js, home.js) can share loaded articles via window.articles.
var articles = [];

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str == null ? '' : String(str);
    return d.innerHTML;
}

function formatArticleLink(article) {
    return `article.html?slug=${encodeURIComponent(article.webLink)}`;
}

function formatRelativeDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    const diffMs = Date.now() - d.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'NOW';
    if (mins < 60) return `${mins}M AGO`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}H AGO`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'YESTERDAY';
    if (days < 7) return `${days} DAYS AGO`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
}

function estimateReadTime(html) {
    const text = (html || '').replace(/<[^>]*>/g, ' ');
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    return `${Math.max(1, Math.round(words / 200))} MIN READ`;
}

// "3 MIN READ" from the stored read_minutes column ('' until it exists / is filled).
function readTimeLabel(row) {
    return row && row.read_minutes ? `${row.read_minutes} MIN READ` : '';
}

// Only the columns list views need. Never pull `context` (the full article
// body) for lists: it was ~95% of every page's Supabase download.
const ARTICLE_LIST_COLUMNS = 'id,title,summary,category,author,created_at,image_url,web_link';

// Select article rows with read_minutes; if that column doesn't exist yet
// (migration not run), retry without it so the site keeps working.
async function selectArticleList(build) {
    let res = await build(db.from('article').select(ARTICLE_LIST_COLUMNS + ',read_minutes'));
    if (res.error && /read_minutes/.test(res.error.message || '')) {
        res = await build(db.from('article').select(ARTICLE_LIST_COLUMNS));
    }
    return res;
}

// Serve Supabase Storage photos through Netlify's Image CDN: resized to the
// display width, modern format, cached at Netlify, so Supabase serves each
// original roughly once instead of on every page view. Local dev uses originals.
const SUPABASE_PUBLIC_IMAGES = /^https:\/\/otnnyxtttsiypjskrshw\.supabase\.co\/storage\/v1\/object\/public\//;
function imgSrc(url, width) {
    if (!url || !SUPABASE_PUBLIC_IMAGES.test(url)) return url;
    const host = location.hostname;
    if (!host || host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost')) return url;
    return `/.netlify/images?url=${encodeURIComponent(url)}&w=${width}&q=75`;
}

// Pulls published articles from the Supabase "article" table and maps
// them onto camelCase fields used across the site.
async function loadArticlesFromSupabase() {
    const { data, error } = await selectArticleList(q => q.order('created_at', { ascending: false }));

    if (error) {
        console.error('Failed to load articles from Supabase', error);
        return [];
    }

    return (data || []).map((row, i) => ({
        id: row.id,
        tag: row.category || 'News',
        title: row.title || '',
        dek: row.summary || '',
        author: row.author || '',
        readTime: readTimeLabel(row),
        date: formatRelativeDate(row.created_at),
        createdAt: row.created_at,
        thumb: (i % 3) + 1,
        imageUrl: row.image_url || null,
        webLink: row.web_link
    }));
}

// Recent news. If the table ever gains a `url` column, items become links.
async function loadRecentNews() {
    const { data, error } = await db
        .from('recent_news')
        .select('*')
        .order('date', { ascending: false });

    if (error) {
        console.error('Failed to load recent news', error);
        return [];
    }

    return (data || []).map(row => ({
        headline: row.headline,
        url: row.url || null,
        date: new Date(row.date + 'T12:00:00').toLocaleDateString('en-US', {
            month: 'long', day: 'numeric', year: 'numeric'
        }).toUpperCase()
    }));
}

/* ---------- ticker ---------- */

function renderTickerUI(track, items) {
    if (!track || !items.length || _tickerActive) return;
    _tickerActive = true;
    let idx = 0;
    track.innerHTML = '<span class="ticker-label"><i class="live-dot" aria-hidden="true"></i>Latest</span>'
        + '<span class="ticker-item" aria-live="polite">' + escapeHtml(items[0]) + '</span>'
        + '<span class="ticker-count">1/' + items.length + '</span>';
    if (items.length < 2) return;

    setInterval(function () {
        const item = track.querySelector('.ticker-item');
        const count = track.querySelector('.ticker-count');
        if (!item || document.hidden) return;

        // Slide current item out to the left, then bring the next in from the right.
        item.classList.add('ticker-out');
        setTimeout(function () {
            idx = (idx + 1) % items.length;
            item.textContent = items[idx];
            if (count) count.textContent = (idx + 1) + '/' + items.length;
            item.classList.remove('ticker-out');
            item.classList.add('ticker-in');
            void item.offsetWidth; // commit the start position before animating back
            item.classList.remove('ticker-in');
        }, 350);
    }, 5000);
}

async function loadTicker() {
    const { data, error } = await db
        .from('ticker')
        .select('*')
        .order('display_order', { ascending: true });

    if (error) {
        console.error('Failed to load ticker', error);
        return [];
    }
    return (data || []).map(row => row.text);
}

async function initTicker() {
    TICKER = await loadTicker();
    renderTickerUI(document.getElementById('tickerTrack'), TICKER);
}

/* ---------- search ---------- */

let _searchArticlesPromise = null;
function getSearchArticles() {
    if (window.articles && window.articles.length) return Promise.resolve(window.articles);
    if (!_searchArticlesPromise) {
        _searchArticlesPromise = loadArticlesFromSupabase().then(rows => {
            if (!window.articles || !window.articles.length) window.articles = rows;
            return rows;
        });
    }
    return _searchArticlesPromise;
}

function highlightMatch(text, term) {
    const safe = escapeHtml(text);
    if (!term) return safe;
    const escTerm = escapeHtml(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return safe.replace(new RegExp(escTerm, 'gi'), m => `<mark>${m}</mark>`);
}

function initSearch() {
    const searchContainer = document.querySelector('.search-container');
    const searchButton = document.getElementById('searchButton');
    const searchInput = document.getElementById('searchInput');
    const resultsBox = document.getElementById('searchResults');

    if (!searchContainer || !searchButton || !searchInput || !resultsBox) return;

    searchButton.setAttribute('role', 'button');
    searchButton.setAttribute('aria-label', 'Search articles (press / )');
    searchInput.setAttribute('aria-label', 'Search articles');

    let activeIndex = -1;

    function closeResults() {
        resultsBox.classList.remove('show');
        activeIndex = -1;
    }

    function openSearch() {
        searchContainer.classList.add('open');
        searchInput.focus();
        getSearchArticles(); // warm the cache
    }

    function closeSearch() {
        searchContainer.classList.remove('open');
        searchInput.value = '';
        resultsBox.innerHTML = '';
        closeResults();
        searchInput.blur();
    }

    function setActive(i) {
        const items = resultsBox.querySelectorAll('a.search-result');
        if (!items.length) return;
        activeIndex = (i + items.length) % items.length;
        items.forEach((el, n) => el.classList.toggle('active', n === activeIndex));
        items[activeIndex].scrollIntoView({ block: 'nearest' });
    }

    searchButton.addEventListener('click', () => {
        searchContainer.classList.contains('open') ? closeSearch() : openSearch();
    });
    searchButton.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); searchButton.click(); }
    });

    // "/" or Cmd/Ctrl+K opens search from anywhere (except while typing in a field).
    document.addEventListener('keydown', e => {
        const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)
            || document.activeElement.isContentEditable;
        if ((e.key === '/' && !typing) || (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey))) {
            e.preventDefault();
            openSearch();
        }
    });

    searchInput.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(activeIndex + 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(activeIndex - 1); }
        else if (e.key === 'Enter') {
            const items = resultsBox.querySelectorAll('a.search-result');
            const target = items[activeIndex] || items[0];
            if (target) { e.preventDefault(); location.href = target.href; }
        } else if (e.key === 'Escape') {
            closeSearch();
        }
    });

    searchInput.addEventListener('input', async () => {
        const raw = searchInput.value.trim();
        const term = raw.toLowerCase();
        activeIndex = -1;

        if (!term) {
            resultsBox.innerHTML = '';
            closeResults();
            return;
        }

        const list = await getSearchArticles();
        if (searchInput.value.trim() !== raw) return; // user kept typing

        const matches = list.filter(a =>
            [a.title, a.dek, a.author, a.tag].some(v => (v || '').toLowerCase().includes(term))
        );

        if (!matches.length) {
            resultsBox.innerHTML = '<div class="search-result search-empty">No articles found.</div>';
        } else {
            resultsBox.innerHTML = matches.slice(0, 8).map(a => `
                <a class="search-result" href="${formatArticleLink(a)}">
                    <div class="search-result-title">${highlightMatch(a.title, raw)}</div>
                    <div class="search-result-meta">${highlightMatch(a.author, raw)} • ${highlightMatch(a.tag, raw)}</div>
                </a>`).join('')
                + '<div class="search-hint">↑↓ to move · Enter to open · Esc to close</div>';
        }
        resultsBox.classList.add('show');
    });

    document.addEventListener('click', e => {
        if (!searchContainer.contains(e.target)) closeResults();
    });
}

async function loadSocialFeed() {
    const { data, error } = await db
        .from('social_feed')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error(error);
        return [];
    }
    return data;
}
