/* Homepage: hero, story list (tabs + load more), recent news, scores strip,
   standings, scroll reveals and the layout switcher. */
(function () {
    if (!document.body.classList.contains('home')) return;

    const $ = id => document.getElementById(id);
    const PAGE_SIZE = { a: 4, b: 5 };   // b: one wide card + 2x2
    const NEWS_COLLAPSED = 5;
    const NEW_WINDOW_MS = 72 * 3600 * 1000;   // first-time visitors: last 3 days are "new"
    const NHL = feed => `/.netlify/functions/nhl?feed=${feed}`;

    const state = {
        stories: [],      // everything except the hero
        filter: 'All',
        shown: 0,
        news: [],
        newsOpen: false,
        standings: null,
        standingsLoading: null,
        stView: 'div',
        ld: {},
        ldLoading: {},
        ldError: {},
        ldWaiting: false,
        scoresReady: false,
        ldGroup: 'skaters',
        ldCat: 'points',
        lastVisit: readLastVisit()
    };

    const variant = () => (document.body.className.match(/variant-([ab])/) || [, 'b'])[1];

    /* ---------- "NEW" since last visit ---------- */

    function readLastVisit() {
        try {
            // Keep the same reference point for the whole browser session so
            // badges don't vanish on refresh, then record this visit.
            let prev = sessionStorage.getItem('puckd-prev-visit');
            if (prev === null) {
                prev = localStorage.getItem('puckd-last-visit') || '';
                sessionStorage.setItem('puckd-prev-visit', prev);
            }
            localStorage.setItem('puckd-last-visit', String(Date.now()));
            return prev ? Number(prev) : null;
        } catch (e) {
            return null;
        }
    }

    function isNew(article) {
        const t = new Date(article.createdAt).getTime();
        if (isNaN(t)) return false;
        return state.lastVisit ? t > state.lastVisit : Date.now() - t < NEW_WINDOW_MS;
    }

    /* ---------- scroll reveal ---------- */

    const revealObserver = ('IntersectionObserver' in window && !prefersReducedMotion)
        ? new IntersectionObserver(entries => {
            entries.forEach(e => {
                if (e.isIntersecting) {
                    e.target.classList.add('in');
                    revealObserver.unobserve(e.target);
                }
            });
        }, { rootMargin: '0px 0px 15% 0px', threshold: 0 })
        : null;

    function reveal(els) {
        els.forEach((el, i) => {
            el.classList.add('reveal');
            el.style.setProperty('--i', i % 6);
            if (revealObserver) revealObserver.observe(el);
            else el.classList.add('in');
        });
    }

    // Fade/wipe images in once they've actually loaded (no half-painted images).
    function watchImages(root) {
        root.querySelectorAll('img').forEach(img => {
            const box = img.closest('.thumb') || img.parentElement;
            const done = () => box.classList.add('img-loaded');
            if (img.complete && img.naturalWidth) done();
            else {
                img.addEventListener('load', done, { once: true });
                img.addEventListener('error', done, { once: true });
            }
        });
    }

    /* ---------- hero ---------- */

    function renderHero(hero) {
        const heroEl = $('hero');
        if (!hero) {
            $('heroTitle').textContent = 'No article available';
            $('heroDek').textContent = 'Publish your first article from the admin dashboard.';
            $('heroEyebrow').textContent = 'Latest';
            $('heroByline').textContent = '';
            $('heroArt').classList.add('no-image');
            heroEl.classList.add('ready');
            return;
        }

        const link = formatArticleLink(hero);
        $('heroTitle').textContent = hero.title;
        $('heroDek').textContent = hero.dek;
        $('heroEyebrow').textContent = hero.tag;
        $('heroByline').innerHTML =
            (hero.author ? `<span>By <b>${escapeHtml(hero.author)}</b></span><span class="dot-sep">·</span>` : '')
            + `<span>${escapeHtml(hero.readTime)}</span><span class="dot-sep">·</span><span>${escapeHtml(hero.date)}</span>`;
        $('heroLink').href = link;
        $('heroCta').href = link;
        $('heroCta').hidden = false;

        const art = $('heroArt');
        const img = $('heroImage');
        if (hero.imageUrl) {
            img.addEventListener('load', () => art.classList.add('img-loaded'), { once: true });
            img.addEventListener('error', () => art.classList.add('no-image'), { once: true });
            img.alt = hero.title;
            img.src = hero.imageUrl;
        } else {
            art.classList.add('no-image');
        }

        // The whole hero becomes a click target; keyboard users get the CTA link.
        heroEl.classList.add('clickable');
        heroEl.onclick = e => {
            if (e.target.closest('a, button')) return;
            location.href = link;
        };

        requestAnimationFrame(() => heroEl.classList.add('ready'));
    }

    function replayHero() {
        const heroEl = $('hero');
        heroEl.classList.remove('ready');
        void heroEl.offsetWidth;
        heroEl.classList.add('ready');
    }

    /* ---------- category tabs + story list ---------- */

    function renderTabs() {
        const counts = {};
        state.stories.forEach(a => { counts[a.tag] = (counts[a.tag] || 0) + 1; });
        const tags = Object.keys(counts).sort((x, y) => counts[y] - counts[x]);
        if (tags.length < 2) { $('catTabs').hidden = true; return; }

        $('catTabs').innerHTML = ['All', ...tags].map(t => `
            <button type="button" class="cat-tab${t === state.filter ? ' active' : ''}" role="tab"
                aria-selected="${t === state.filter}" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('');
    }

    function filtered() {
        return state.filter === 'All'
            ? state.stories
            : state.stories.filter(a => a.tag === state.filter);
    }

    function cardHtml(a, n) {
        return `
<a class="article-row" href="${formatArticleLink(a)}">
    <div class="thumb">
        ${a.imageUrl
            ? `<img src="${escapeHtml(a.imageUrl)}" alt="" loading="lazy" decoding="async">`
            : `<div class="thumb-fallback" aria-hidden="true"><span>PUCK<i>'</i>D</span></div>`}
        ${isNew(a) ? '<span class="new-badge">New</span>' : ''}
    </div>
    <div class="article-body">
        <span class="tag">${escapeHtml(a.tag)}</span>
        <h3>${escapeHtml(a.title)}</h3>
        <p>${escapeHtml(a.dek)}</p>
        <div class="meta-row">
            ${a.author ? `<span>${escapeHtml(a.author)}</span><span class="dot-sep">·</span>` : ''}
            <span>${escapeHtml(a.readTime)}</span>
            <span class="dot-sep">·</span>
            <span>${escapeHtml(a.date)}</span>
        </div>
    </div>
</a>`;
    }

    function renderStories(reset) {
        const list = $('articleList');
        const items = filtered();
        const size = PAGE_SIZE[variant()];

        if (reset) {
            state.shown = Math.min(size, items.length);
            list.innerHTML = items.slice(0, state.shown).map((a, k) => cardHtml(a, k + 1)).join('')
                || '<p class="empty-note">No stories in this category yet.</p>';
            if (!state.stories.length) {
                list.innerHTML = '<p class="empty-note">No articles yet. Publish one from the admin dashboard.</p>';
            }
            const cards = [...list.children];
            reveal(cards);
            watchImages(list);
        } else {
            const start = state.shown;
            state.shown = Math.min(start + size, items.length);
            const tmp = document.createElement('div');
            tmp.innerHTML = items.slice(start, state.shown).map((a, k) => cardHtml(a, start + k + 1)).join('');
            const cards = [...tmp.children];
            cards.forEach(c => list.appendChild(c));
            reveal(cards);
            watchImages(list);
            // Move keyboard focus to the first new story without jumping the page.
            if (cards[0] && cards[0].focus) cards[0].focus({ preventScroll: true });
        }

        const remaining = items.length - state.shown;
        $('loadMore').hidden = remaining <= 0;
        $('loadMoreCount').textContent = remaining > 0 ? `(${remaining})` : '';
    }

    $('catTabs').addEventListener('click', e => {
        const btn = e.target.closest('.cat-tab');
        if (!btn || btn.dataset.tag === state.filter) return;
        state.filter = btn.dataset.tag;
        $('catTabs').querySelectorAll('.cat-tab').forEach(b => {
            const on = b === btn;
            b.classList.toggle('active', on);
            b.setAttribute('aria-selected', on);
        });

        // Quick fade-out, swap, then the new cards reveal in.
        const list = $('articleList');
        list.classList.add('swapping');
        setTimeout(() => {
            renderStories(true);
            list.classList.remove('swapping');
        }, prefersReducedMotion ? 0 : 160);
    });

    $('loadMore').addEventListener('click', () => renderStories(false));

    /* ---------- recent news ---------- */

    function renderNews() {
        const box = $('recentNewsList');
        const toggle = $('newsToggle');
        if (!state.news.length) {
            box.innerHTML = '<p class="empty-note">No recent news available.</p>';
            toggle.hidden = true;
            return;
        }
        const visible = state.newsOpen ? state.news : state.news.slice(0, NEWS_COLLAPSED);
        box.innerHTML = visible.map(item => {
            const inner = `<div class="news-date">${escapeHtml(item.date)}</div>
                <div class="news-headline">${escapeHtml(item.headline)}</div>`;
            return item.url
                ? `<a class="news-item is-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${inner}</a>`
                : `<div class="news-item">${inner}</div>`;
        }).join('');

        const hiddenCount = state.news.length - NEWS_COLLAPSED;
        toggle.hidden = hiddenCount <= 0;
        toggle.textContent = state.newsOpen ? 'Show less' : `Show ${hiddenCount} more`;
        toggle.setAttribute('aria-expanded', state.newsOpen);
        reveal([...box.children]);
    }

    $('newsToggle').addEventListener('click', () => {
        state.newsOpen = !state.newsOpen;
        renderNews();
    });

    /* ---------- scores strip ---------- */

    let scoresTimer = null;

    function gameStatus(g) {
        const pd = g.periodDescriptor || {};
        const clock = g.clock || {};
        const suffix = pd.periodType && pd.periodType !== 'REG' ? '/' + pd.periodType : '';
        if (g.gameState === 'LIVE' || g.gameState === 'CRIT') {
            const per = pd.periodType === 'OT' ? 'OT' : pd.periodType === 'SO' ? 'SO' : `P${pd.number || ''}`;
            return { live: true, text: clock.inIntermission ? `${per} INT` : `${per} ${clock.timeRemaining || ''}` };
        }
        if (g.gameState === 'OFF' || g.gameState === 'FINAL') return { final: true, text: 'Final' + suffix };
        if (g.gameScheduleState && g.gameScheduleState !== 'OK') return { text: g.gameScheduleState };
        const t = new Date(g.startTimeUTC);
        return { text: isNaN(t) ? '' : t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) };
    }

    function teamLine(team, other, showScore, final) {
        const won = final && team.score > other.score;
        return `<span class="sc-team${won ? ' won' : ''}">
            ${team.logo ? `<img src="${escapeHtml(team.logo)}" alt="" width="20" height="20" loading="lazy">` : ''}
            <span class="sc-abbr">${escapeHtml(team.abbrev)}</span>
            ${showScore ? `<span class="sc-score">${team.score ?? 0}</span>` : ''}
        </span>`;
    }

    async function loadScores() {
        try {
            const res = await fetch(NHL('score'));
            if (!res.ok) throw new Error(res.status);
            const data = await res.json();
            const games = data.games || [];
            loadNight(data);
            if (!games.length) { $('scoresStrip').hidden = true; return; }

            let anyLive = false;
            $('scoresTrack').innerHTML = games.map(g => {
                const s = gameStatus(g);
                anyLive = anyLive || !!s.live;
                const started = s.live || s.final;
                const href = g.gameCenterLink ? `https://www.nhl.com${g.gameCenterLink}` : null;
                const tag = href ? 'a' : 'div';
                return `<${tag} class="sc-game${s.live ? ' is-live' : ''}"${href ? ` href="${escapeHtml(href)}" target="_blank" rel="noopener"` : ''}>
                    <span class="sc-status">${s.live ? '<i class="live-dot"></i>' : ''}${escapeHtml(s.text)}</span>
                    ${teamLine(g.awayTeam, g.homeTeam, started, s.final)}
                    ${teamLine(g.homeTeam, g.awayTeam, started, s.final)}
                </${tag}>`;
            }).join('');

            $('scoresLabel').innerHTML = '<i class="live-dot"></i>Live';
            $('scoresLabel').hidden = !anyLive;

            const strip = $('scoresStrip');
            if (!state.scoresReady) {
                state.scoresReady = true;
                strip.hidden = false;
                const track = $('scoresTrack');
                const fade = () => track.classList.toggle('overflowing', track.scrollWidth > track.clientWidth + 4);
                fade();
                window.addEventListener('resize', fade, { passive: true });
                requestAnimationFrame(() => strip.classList.add('ready'));
            }

            clearTimeout(scoresTimer);
            if (anyLive) scoresTimer = setTimeout(loadScores, 60000);
        } catch (err) {
            console.warn('Scores unavailable', err);
            $('scoresStrip').hidden = true;
        }
    }

    /* ---------- standings: divisions / wild card ---------- */

    const DIV_ORDER = ['Atlantic', 'Metropolitan', 'Central', 'Pacific'];
    const CONF_SHORT = { Eastern: 'East', Western: 'West' };

    function teamCell(t, chip) {
        const logo = t.teamLogoDark || t.teamLogo;
        return `<span class="st-team">
            ${logo ? `<img src="${escapeHtml(logo)}" alt="" width="26" height="26" loading="lazy">` : ''}
            <span class="st-abbr">${escapeHtml(t.teamAbbrev?.default || '')}</span>
            <span class="st-name">${escapeHtml(t.teamCommonName?.default || '')}</span>
            ${chip || ''}
        </span>`;
    }

    // Playoff status from the NHL feed: wildcardSequence 0 = top-3 division seed,
    // 1–2 = wild card, 3+ = outside. clinchIndicator appears late in the season.
    function status(t) {
        if (t.wildcardSequence === 0) return 'is-seed';
        if (t.wildcardSequence === 1 || t.wildcardSequence === 2) return 'is-wc';
        return 'is-out';
    }

    function rowHtml(t, i, rank, maxPts, lastCol) {
        const st = status(t);
        const chips = (st === 'is-wc' ? `<span class="st-chip wc">WC${t.wildcardSequence}</span>` : '')
            + (t.clinchIndicator ? `<span class="st-chip clinch" title="Clinched">${escapeHtml(t.clinchIndicator)}</span>` : '');
        const gd = t.goalDifferential;
        return `<div class="st-row ${st}" style="--i:${i}; --pct:${(t.points / maxPts).toFixed(3)}">
            <span class="st-rank">${rank}</span>
            ${teamCell(t, chips)}
            <span class="hide-sm">${t.gamesPlayed}</span>
            <span class="st-rec">${t.wins}-${t.losses}-${t.otLosses}</span>
            <span class="st-gd hide-sm ${gd > 0 ? 'pos' : gd < 0 ? 'neg' : ''}">${gd > 0 ? '+' : ''}${gd}</span>
            ${lastCol(t)}
            <span class="st-pts">${t.points}</span>
            <span class="st-bar" aria-hidden="true"></span>
        </div>`;
    }

    function streakCol(t) {
        const code = (t.streakCode || '').toLowerCase();
        return `<span class="st-strk hide-sm ${code}">${t.streakCode ? t.streakCode + t.streakCount : '–'}</span>`;
    }

    function colsHtml(last) {
        return `<div class="st-cols" aria-hidden="true">
            <span>#</span><span>Team</span><span class="hide-sm">GP</span><span>W-L-OT</span>
            <span class="hide-sm">GD</span><span class="hide-sm">${last}</span><span>PTS</span>
        </div>`;
    }

    function divisionsView(rows, maxPts) {
        const byDiv = {};
        rows.forEach(t => (byDiv[t.divisionName] = byDiv[t.divisionName] || []).push(t));
        return DIV_ORDER.filter(d => byDiv[d]).map(name => {
            const teams = byDiv[name].sort((a, b) => a.divisionSequence - b.divisionSequence);
            let i = 0;
            const body = teams.map(t => {
                const html = rowHtml(t, i++, t.divisionSequence, maxPts, streakCol);
                // slash rule under the 3 division seeds
                return t.divisionSequence === 3 ? html + '<div class="st-cut" aria-hidden="true"></div>' : html;
            }).join('');
            return `<article class="st-card">
                <header class="st-card-head">
                    <h3 class="st-card-title">${escapeHtml(name)}</h3>
                    <span class="st-card-meta">${escapeHtml(CONF_SHORT[teams[0].conferenceName] || '')}</span>
                </header>
                ${colsHtml('STRK')}
                ${body}
            </article>`;
        }).join('');
    }

    function wildCardView(rows, maxPts) {
        return ['Eastern', 'Western'].map(conf => {
            const teams = rows.filter(t => t.conferenceName === conf);
            if (!teams.length) return '';
            const divs = DIV_ORDER.filter(d => teams.some(t => t.divisionName === d));
            const race = teams.filter(t => t.wildcardSequence > 0).sort((a, b) => a.wildcardSequence - b.wildcardSequence);
            const wc2 = race.find(t => t.wildcardSequence === 2);
            const pbCol = t => {
                const back = wc2 && t.wildcardSequence > 2 ? wc2.points - t.points : null;
                return `<span class="st-pb hide-sm">${back === null ? '–' : back <= 0 ? 'E' : '−' + back}</span>`;
            };
            let i = 0;
            const divBlocks = divs.map(d => {
                const top = teams.filter(t => t.divisionName === d && t.wildcardSequence === 0)
                    .sort((a, b) => a.divisionSequence - b.divisionSequence);
                return `<div class="st-sub">${escapeHtml(d)}</div>`
                    + top.map(t => rowHtml(t, i++, t.divisionSequence, maxPts, pbCol)).join('');
            }).join('');
            const raceBlock = `<div class="st-sub st-sub--wc">Wild Card</div>`
                + race.map(t => {
                    const html = rowHtml(t, i++, t.wildcardSequence, maxPts, pbCol);
                    return t.wildcardSequence === 2 ? html + '<div class="st-cut st-cut--wc" aria-hidden="true"></div>' : html;
                }).join('');
            return `<article class="st-card">
                <header class="st-card-head">
                    <h3 class="st-card-title">${escapeHtml(conf)}</h3>
                    <span class="st-card-meta">Conference</span>
                </header>
                ${colsHtml('PB')}
                ${divBlocks}${raceBlock}
            </article>`;
        }).join('');
    }

    function renderStandings() {
        const rows = state.standings || [];
        if (!rows.length) return;
        const maxPts = Math.max(...rows.map(t => t.points), 1);
        const grid = $('standingsGrid');
        grid.innerHTML = state.stView === 'wc' ? wildCardView(rows, maxPts) : divisionsView(rows, maxPts);
        reveal([...grid.children]);

    }

    function loadStandings() {
        if (state.standingsLoading) return state.standingsLoading;
        state.standingsLoading = fetch(NHL('standings'))
            .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
            .then(data => {
                state.standings = data.standings || [];
                $('standings').classList.add('has-data');
                renderStandings();
            })
            .catch(err => {
                console.warn('Standings unavailable', err);
                $('standings').classList.add('failed');
            });
        return state.standingsLoading;
    }

    document.querySelector('#standings .st-views').addEventListener('click', e => {
        const btn = e.target.closest('.st-view');
        if (!btn || btn.dataset.view === state.stView) return;
        state.stView = btn.dataset.view;
        document.querySelectorAll('#standings .st-view').forEach(b => {
            b.classList.toggle('active', b === btn);
            b.setAttribute('aria-selected', b === btn);
        });
        const grid = $('standingsGrid');
        grid.classList.add('swapping');
        setTimeout(() => {
            renderStandings();
            grid.classList.remove('swapping');
        }, prefersReducedMotion ? 0 : 150);
    });


    /* ---------- scoring leaders: skaters / defense / rookies / goalies ---------- */

    const nhlAsset = url => (typeof url === 'string' && /^https:\/\/assets\.nhle\.com\//.test(url)) ? url : '';
    const darkLogo = url => nhlAsset(url).replace('_light.svg', '_dark.svg');

    const LD_GROUPS = {
        skaters: { feed: 'leaders', title: 'Scoring Leaders', label: 'League leader', cats: [['points', 'Points', 'PTS'], ['goals', 'Goals', 'G'], ['assists', 'Assists', 'A']] },
        defense: { feed: 'defense', title: 'Defense Leaders', label: 'Top defenseman', cats: [['points', 'Points', 'PTS'], ['goals', 'Goals', 'G'], ['assists', 'Assists', 'A']] },
        rookies: { feed: 'rookies', title: 'Rookie Leaders', label: 'Top rookie', cats: [['points', 'Points', 'PTS'], ['goals', 'Goals', 'G'], ['assists', 'Assists', 'A']] },
        goalies: { feed: 'goalies', title: 'Goalie Leaders', label: 'League leader', cats: [['wins', 'Wins', 'W'], ['savePctg', 'Save %', 'SV%'], ['goalsAgainstAverage', 'GAA', 'GAA'], ['shutouts', 'Shutouts', 'SO']] }
    };
    const LOWER_IS_BETTER = { goalsAgainstAverage: true };

    // api-web leader rows (skaters + goalies)
    function fromLeaders(p) {
        return {
            first: p.firstName?.default || '', last: p.lastName?.default || '',
            headshot: nhlAsset(p.headshot), team: p.teamAbbrev || '', logo: darkLogo(p.teamLogo),
            pos: p.position || '', value: p.value
        };
    }

    // stats-API summary rows (defense + rookies): build headshot/logo from ids
    function fromSummary(r, cat) {
        const team = String(r.teamAbbrevs || '').split(',').pop().trim();
        const ok = /^[A-Z]{2,3}$/.test(team) && /^\d+$/.test(String(r.playerId)) && /^\d{8}$/.test(String(r.seasonId));
        const parts = String(r.skaterFullName || '').split(' ');
        return {
            first: parts.shift() || '', last: parts.join(' '),
            headshot: ok ? `https://assets.nhle.com/mugs/nhl/${r.seasonId}/${team}/${r.playerId}.png` : '',
            team, logo: /^[A-Z]{2,3}$/.test(team) ? `https://assets.nhle.com/logos/nhl/svg/${team}_dark.svg` : '',
            pos: r.positionCode || '', value: r[cat]
        };
    }

    function formatValue(cat, v) {
        if (cat === 'savePctg') return Number(v).toFixed(3).replace(/^0/, '');
        if (cat === 'goalsAgainstAverage') return Number(v).toFixed(2);
        return v;
    }

    function ldList() {
        const raw = state.ld[state.ldGroup];
        if (!raw) return [];
        if (state.ldGroup === 'skaters' || state.ldGroup === 'goalies') {
            return (raw[state.ldCat] || []).map(fromLeaders);
        }
        return (raw.data || [])
            .map(r => fromSummary(r, state.ldCat))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);
    }

    function renderLdCats() {
        $('ldCats').innerHTML = LD_GROUPS[state.ldGroup].cats.map(([key, name]) =>
            `<button type="button" class="ld-cat${key === state.ldCat ? ' active' : ''}" data-cat="${key}" role="tab" aria-selected="${key === state.ldCat}">${name}</button>`
        ).join('');
    }

    // The card + list panel are built once; tab switches only swap what's inside them.
    function ensureLeaderShell() {
        const grid = $('leadersGrid');
        if (grid.querySelector('.ld-top')) return;
        grid.innerHTML = `
            <article class="ld-top">
                <div class="ld-top-shot ld-c"></div>
                <div class="ld-top-body ld-c"></div>
            </article>
            <div class="ld-list"></div>`;
        reveal([...grid.children]);
        // after the first entrance, rows no longer slide in on every switch
        setTimeout(() => grid.classList.add('ld-settled'), 900);
    }

    function renderLeaders() {
        ensureLeaderShell();
        const grid = $('leadersGrid');
        const shot = grid.querySelector('.ld-top-shot');
        const body = grid.querySelector('.ld-top-body');
        const listEl = grid.querySelector('.ld-list');
        const list = ldList();
        if (!list.length) {
            shot.innerHTML = '';
            listEl.innerHTML = '';
            body.innerHTML = `<p class="ld-note">${state.ldError[state.ldGroup] ? 'Couldn’t load these leaders right now.' : 'No leaders yet this season.'}</p>`;
            return;
        }
        const group = LD_GROUPS[state.ldGroup];
        const cat = state.ldCat;
        const label = (group.cats.find(c => c[0] === cat) || [, , ''])[2];
        const vals = list.map(p => Number(p.value) || 0);
        const pct = v => LOWER_IS_BETTER[cat]
            ? (Math.min(...vals) || 1) / (v || 1)
            : v / (Math.max(...vals) || 1);
        const team = p => `<span class="ld-team">${p.logo ? `<img src="${escapeHtml(p.logo)}" alt="" width="22" height="22" loading="lazy">` : ''}${escapeHtml(p.team)}</span>`;
        const top = list[0];

        shot.innerHTML = top.headshot ? `<img src="${escapeHtml(top.headshot)}" alt="${escapeHtml(top.first + ' ' + top.last)}" loading="lazy">` : '';
        body.innerHTML = `
            <span class="ld-rank">${escapeHtml(group.label)}</span>
            <h3 class="ld-top-name"><span>${escapeHtml(top.first)}</span>${escapeHtml(top.last)}</h3>
            ${team(top)}
            <div class="ld-top-value">${escapeHtml(String(formatValue(cat, top.value)))}<small>${label}</small></div>`;
        listEl.innerHTML = list.slice(1).map((p, i) => `
            <div class="ld-row" style="--i:${i}; --pct:${Math.max(0, Math.min(1, pct(Number(p.value) || 0))).toFixed(3)}">
                <span class="ld-n">${i + 2}</span>
                <span class="ld-shot">${p.headshot ? `<img src="${escapeHtml(p.headshot)}" alt="" loading="lazy">` : ''}</span>
                <span class="ld-name">${escapeHtml(p.first + ' ' + p.last)}<small>${escapeHtml(p.pos)}</small></span>
                ${team(p)}
                <span class="ld-val">${escapeHtml(String(formatValue(cat, p.value)))}</span>
                <span class="ld-bar" aria-hidden="true"></span>
            </div>`).join('');
    }

    function loadLeaderGroup(group) {
        if (state.ld[group] || state.ldLoading[group]) return state.ldLoading[group];
        state.ldLoading[group] = fetch(NHL(LD_GROUPS[group].feed))
            .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
            .then(data => {
                state.ld[group] = data;
                if (group === 'skaters' && (data.points || []).length) $('leaders').classList.add('has-data');
                if (group === state.ldGroup) {
                    if (!$('leadersGrid').querySelector('.ld-top')) renderLeaders();
                    else if (state.ldWaiting) fadeInLeaders();
                }
                // preload the other tabs so switching is instant
                if (group === 'skaters') setTimeout(() => ['defense', 'rookies', 'goalies'].forEach(loadLeaderGroup), 600);
            })
            .catch(err => {
                console.warn('Leaders unavailable', group, err);
                state.ldLoading[group] = null;
                state.ldError[group] = true;
                if (group === state.ldGroup && state.ldWaiting) fadeInLeaders();
            });
        return state.ldLoading[group];
    }

    function loadLeaders() {
        renderLdCats();
        loadLeaderGroup('skaters');
    }

    // After the next paint (so new content starts hidden), with a timer fallback
    // for background tabs where animation frames are paused.
    function afterPaint(fn) {
        let done = false;
        const run = () => { if (!done) { done = true; fn(); } };
        requestAnimationFrame(() => requestAnimationFrame(run));
        setTimeout(run, 80);
    }

    let ldTitleTimer = null;
    function swapLeaderTitle() {
        const section = $('leaders');
        const text = document.querySelector('#leadersTitle .ld-title-text');
        const next = LD_GROUPS[state.ldGroup].title;
        if (!text || text.textContent === next) return;
        if (prefersReducedMotion) { text.textContent = next; return; }
        section.classList.add('ld-title-out');
        clearTimeout(ldTitleTimer);
        ldTitleTimer = setTimeout(() => {
            text.textContent = LD_GROUPS[state.ldGroup].title;
            afterPaint(() => section.classList.remove('ld-title-out'));
        }, 300);
    }

    // Fade the contents out, swap, fade back in; the card and panel never move.
    // If a tab's data is still in flight, stay faded until it lands (no "Loading…" flash).
    let ldSwapTimer = null;
    const ldReady = () => !!(state.ld[state.ldGroup] || state.ldError[state.ldGroup]);

    function fadeInLeaders() {
        const grid = $('leadersGrid');
        state.ldWaiting = false;
        renderLeaders();
        afterPaint(() => grid.classList.remove('ld-out'));
    }

    function swapLeaders() {
        const grid = $('leadersGrid');
        if (!grid.querySelector('.ld-top')) { if (ldReady()) renderLeaders(); return; }
        if (prefersReducedMotion) {
            if (ldReady()) renderLeaders(); else { state.ldWaiting = true; grid.classList.add('ld-out'); }
            return;
        }
        grid.classList.add('ld-out');
        clearTimeout(ldSwapTimer);
        ldSwapTimer = setTimeout(() => {
            if (ldReady()) fadeInLeaders();
            else state.ldWaiting = true;
        }, 300);
    }

    document.querySelector('.ld-groups').addEventListener('click', e => {
        const btn = e.target.closest('.st-view');
        if (!btn || btn.dataset.group === state.ldGroup) return;
        state.ldGroup = btn.dataset.group;
        state.ldCat = LD_GROUPS[state.ldGroup].cats[0][0];
        document.querySelectorAll('.ld-groups .st-view').forEach(b => {
            b.classList.toggle('active', b === btn);
            b.setAttribute('aria-selected', b === btn);
        });
        renderLdCats();
        swapLeaderTitle();
        swapLeaders();
        loadLeaderGroup(state.ldGroup);
    });

    $('ldCats').addEventListener('click', e => {
        const btn = e.target.closest('.ld-cat');
        if (!btn || btn.dataset.cat === state.ldCat) return;
        state.ldCat = btn.dataset.cat;
        renderLdCats();
        swapLeaders();
    });

    /* ---------- lamp lighters: every goal from the latest finished slate ---------- */

    const isFinal = g => g.gameState === 'OFF' || g.gameState === 'FINAL';
    const isLive = g => g.gameState === 'LIVE' || g.gameState === 'CRIT';
    const nhlClip = url => (typeof url === 'string' && /^https:\/\/(www\.)?nhl\.com\//.test(url)) ? url : '';

    // A night's scorers stay up until the first game of the next day goes final.
    // Then it switches to that day: finished games plus games in progress (live).
    let prevSlate = null; // previous night's data, fetched once
    async function loadNight(today) {
        try {
            const games = today.games || [];
            if (games.some(isFinal)) {
                renderNight(games.filter(g => isFinal(g) || isLive(g)), today.currentDate);
                return;
            }
            if (!today.prevDate || !/^\d{4}-\d{2}-\d{2}$/.test(today.prevDate)) return;
            if (!prevSlate) {
                const res = await fetch(NHL('score') + '&date=' + today.prevDate);
                if (!res.ok) throw new Error(res.status);
                prevSlate = await res.json();
            }
            const finals = (prevSlate.games || []).filter(isFinal);
            if (finals.length) renderNight(finals, prevSlate.currentDate);
        } catch (err) {
            console.warn('Lamp Lighters unavailable', err);
        }
    }

    function goalTags(goal) {
        const tags = [];
        if (goal.strength === 'pp') tags.push('<span class="ng-tag pp">PP</span>');
        if (goal.strength === 'sh') tags.push('<span class="ng-tag">SH</span>');
        if (goal.goalModifier === 'empty-net') tags.push('<span class="ng-tag">EN</span>');
        if (goal.goalModifier === 'penalty-shot') tags.push('<span class="ng-tag">PS</span>');
        return tags.join('');
    }

    function periodLabel(goal) {
        const pd = goal.periodDescriptor || {};
        if (pd.periodType === 'OT') return 'OT';
        if (pd.periodType === 'SO') return 'SO';
        return 'P' + (pd.number || goal.period || '');
    }

    function renderNight(games, dateStr) {
        const teamsById = {};
        let goals = 0, pp = 0, extra = 0, shutouts = 0;
        const stars = [];

        games.forEach(g => {
            const pt = g.periodDescriptor?.periodType || g.gameOutcome?.lastPeriodType;
            if (pt === 'OT' || pt === 'SO') extra++;
            if (isFinal(g) && ((g.awayTeam.score || 0) === 0 || (g.homeTeam.score || 0) === 0)) shutouts++;
            [g.awayTeam, g.homeTeam].forEach(t => { teamsById[t.abbrev] = t; });

            const perPlayer = {};
            (g.goals || []).forEach(goal => {
                if ((goal.periodDescriptor || {}).periodType === 'SO') return; // shootout goals aren't goals
                goals++;
                if (goal.strength === 'pp') pp++;
                const k = goal.playerId;
                perPlayer[k] = perPlayer[k] || { goal, n: 0 };
                perPlayer[k].n++;
            });
            Object.values(perPlayer).forEach(({ goal, n }) => {
                if (n >= 2) stars.push({ goal, n, kind: n >= 3 ? 'Hat trick' : 'Multi-goal' });
            });

            // overtime winner
            const last = (g.goals || []).filter(x => (x.periodDescriptor || {}).periodType === 'OT').pop();
            if (last) stars.push({ goal: last, n: null, kind: 'OT winner' });
        });

        stars.sort((a, b) => (b.n || 0) - (a.n || 0));

        const day = new Date((dateStr || '') + 'T12:00:00');
        $('nightDate').textContent = isNaN(day) ? 'Latest slate'
            : day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

        $('nightSummary').innerHTML = [
            [games.length, games.length === 1 ? 'Game' : 'Games'],
            [goals, 'Goals'],
            [pp, 'PP goals'],
            [extra, 'OT / SO'],
            [shutouts, shutouts === 1 ? 'Shutout' : 'Shutouts']
        ].map(([n, l]) => `<div class="ns-stat"><b>${n}</b><span>${l}</span></div>`).join('');

        const teamChip = abbrev => {
            const t = teamsById[abbrev] || {};
            const logo = darkLogo(t.logo);
            return `<span class="ld-team">${logo ? `<img src="${escapeHtml(logo)}" alt="" width="18" height="18" loading="lazy">` : ''}${escapeHtml(abbrev || '')}</span>`;
        };

        $('nightStars').innerHTML = stars.slice(0, 6).map(({ goal, n, kind }) => `
            <div class="ns-card">
                <span class="ns-shot">${nhlAsset(goal.mugshot) ? `<img src="${escapeHtml(goal.mugshot)}" alt="" loading="lazy">` : ''}</span>
                <span class="ns-body">
                    <span class="ns-name">${escapeHtml(goal.firstName?.default || '')} ${escapeHtml(goal.lastName?.default || '')}</span>
                    <span class="ns-meta">${teamChip(goal.teamAbbrev)}<span class="ns-chip${kind === 'Hat trick' ? ' gold' : ''}">${kind}</span></span>
                </span>
                <span class="ns-val">${n ? n : '★'}<small>${n ? 'Goals' : periodLabel(goal) + ' ' + escapeHtml(goal.timeInPeriod || '')}</small></span>
            </div>`).join('');

        $('nightGames').innerHTML = games.map(g => {
            const a = g.awayTeam, h = g.homeTeam;
            const aWin = (a.score || 0) > (h.score || 0);
            const live = isLive(g);
            const pt = g.gameOutcome?.lastPeriodType || g.periodDescriptor?.periodType;
            const status = live ? gameStatus(g).text : 'Final' + (pt && pt !== 'REG' ? '/' + pt : '');
            const team = (t, win, side) => {
                const logo = darkLogo(t.logo);
                return `<span class="ng-team ng-team--${side}${win ? '' : ' lose'}">
                    ${side === 'home' ? escapeHtml(t.abbrev) : ''}
                    ${logo ? `<img src="${escapeHtml(logo)}" alt="" width="28" height="28" loading="lazy">` : ''}
                    ${side === 'away' ? escapeHtml(t.abbrev) : ''}
                </span>`;
            };
            const list = (g.goals || []).filter(x => (x.periodDescriptor || {}).periodType !== 'SO');
            const logoFor = abbrev => darkLogo((teamsById[abbrev] || {}).logo);
            return `<article class="ng-card${live ? ' is-live' : ''}">
                <header class="ng-head">
                    ${team(a, aWin, 'away')}
                    <span class="ng-mid">
                        <span class="ng-score"><span class="${aWin ? '' : 'lose'}">${a.score ?? 0}</span><span class="${aWin ? 'lose' : ''}">${h.score ?? 0}</span></span>
                        <span class="ng-status${live ? ' is-live' : ''}">${live ? '<i class="live-dot"></i>' : ''}${escapeHtml(status)}</span>
                    </span>
                    ${team(h, !aWin, 'home')}
                </header>
                ${list.length ? `<ol class="ng-goals">${list.map(goal => {
                    const clip = nhlClip(goal.highlightClipSharingUrl);
                    const logo = logoFor(goal.teamAbbrev);
                    return `<li class="ng-goal">
                        <span class="ng-time">${periodLabel(goal)} ${escapeHtml(goal.timeInPeriod || '')}</span>
                        ${logo ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(goal.teamAbbrev || '')}" width="18" height="18" loading="lazy">` : '<span></span>'}
                        <span class="ng-who"><b>${escapeHtml(goal.name?.default || '')}</b><small>(${goal.goalsToDate ?? ''})</small></span>
                        <span class="ng-tags">${goalTags(goal)}${clip ? `<a class="ng-clip" href="${escapeHtml(clip)}" target="_blank" rel="noopener" aria-label="Watch ${escapeHtml(goal.name?.default || 'goal')} highlight">▶</a>` : ''}</span>
                    </li>`;
                }).join('')}</ol>` : '<p class="ng-none">No goals.</p>'}
            </article>`;
        }).join('');

        const first = !$('night').classList.contains('has-data');
        $('night').classList.add('has-data');
        if (first) reveal([...$('nightStars').children, ...$('nightGames').children]);
    }

    /* ---------- layout switcher ---------- */

    function syncVariantButtons() {
        document.querySelectorAll('.variant-btn').forEach(b =>
            b.classList.toggle('active', b.dataset.variant === variant()));
    }

    document.querySelectorAll('.variant-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const v = btn.dataset.variant;
            document.body.classList.remove('variant-a', 'variant-b');
            document.body.classList.add('variant-' + v);
            try { localStorage.setItem('puckd-layout', v); } catch (e) {}
            syncVariantButtons();
            renderStories(true);
            window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
            replayHero();
        });
    });

    /* ---------- boot ---------- */

    syncVariantButtons();
    loadStandings();
    loadLeaders();
    loadScores();

    Promise.all([loadArticlesFromSupabase(), loadRecentNews()]).then(([rows, news]) => {
        window.articles = rows; // share with search, no second fetch
        const hero = rows[0] || null;
        state.stories = hero ? rows.slice(1) : rows;
        state.news = news;

        renderHero(hero);
        renderTabs();
        renderStories(true);
        renderNews();
        reveal([document.querySelector('.newsletter .wrap')]);
    });
})();
