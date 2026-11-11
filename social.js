/* ============================================================
   PUCK'D × IceMetrix — the Feed (social.html)
   Rows come from loadSocialFeed() (script.js), table `social_feed`:
   id, account, username, content, created_at, image_url, post_url, verified
   Everything from the DB is escaped before it touches innerHTML.
   ============================================================ */
document.addEventListener("DOMContentLoaded", initSocialPage);

let allPosts = [];
let activeFilter = "All";
let lastVisit = null;

const ACCOUNTS = {
    "PUCK'D Media": { logo: "logo.png", key: "puckd" },
    "IceMetrix": { logo: "IceMetrix.jpg", key: "icx" }
};
const VISIT_KEY = "puckd_feed_last_visit";

async function initSocialPage() {

    lastVisit = readLastVisit();

    let rows = [];
    try {
        rows = await loadSocialFeed();
    } catch (err) {
        console.error(err);
    }
    allPosts = Array.isArray(rows) ? rows.filter(p => p && p.created_at) : [];

    renderStats(allPosts);
    renderSocialFeed(allPosts);
    setupFilters();
    markVisit();

}

/* ---------- "new since your visit" ---------- */
function readLastVisit() {
    try {
        const v = Number(localStorage.getItem(VISIT_KEY));
        return v > 0 ? v : null;
    } catch (e) { return null; }
}
function markVisit() {
    try { localStorage.setItem(VISIT_KEY, String(Date.now())); } catch (e) { /* private mode */ }
}
function isNew(post) {
    return lastVisit !== null && new Date(post.created_at).getTime() > lastVisit;
}

/* ---------- hero stats, tab counts, account panel ---------- */
function renderStats(posts) {

    const statPosts = document.getElementById("statPosts");
    const statLast = document.getElementById("statLast");
    if (statPosts) statPosts.textContent = posts.length;
    if (statLast) {
        if (posts.length) {
            const newest = posts.reduce((a, b) => new Date(a.created_at) > new Date(b.created_at) ? a : b);
            statLast.innerHTML = `<time datetime="${escapeHtml(newest.created_at)}" title="${escapeHtml(fullDate(newest.created_at))}">${escapeHtml(shortAgo(newest.created_at))}</time>`;
        } else {
            statLast.textContent = "—";
        }
    }

    const count = name => name === "All" ? posts.length : posts.filter(p => p.account === name).length;
    document.querySelectorAll("[data-count]").forEach(el => { el.textContent = count(el.dataset.count); });
    document.querySelectorAll("[data-acct-count]").forEach(el => {
        const n = count(el.dataset.acctCount);
        el.innerHTML = `<b>${n}</b> ${n === 1 ? "post" : "posts"}`;
    });

    const fresh = posts.filter(isNew).length;
    const note = document.getElementById("feedNewNote");
    if (note && fresh) {
        note.innerHTML = `<span class="live-dot" aria-hidden="true"></span>${fresh} new since your last visit`;
        note.hidden = false;
    }
}

/* ---------- the timeline ---------- */
function renderSocialFeed(posts) {

    const container = document.getElementById("socialFeed");
    container.setAttribute("aria-busy", "false");

    if (!posts.length) {
        const quiet = activeFilter === "All"
            ? "Nothing on the wire yet. Check back after puck drop."
            : `No posts from ${escapeHtml(activeFilter)} yet.`;
        container.innerHTML = `
            <div class="feed-empty surface">
                <span class="feed-empty-ghost" aria-hidden="true">Quiet</span>
                <h2 class="bc-title bc-title--sm">Quiet on the wire</h2>
                <p>${quiet}</p>
            </div>`;
        announce(0);
        return;
    }

    // group by local calendar day, newest first
    const sorted = [...posts].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const groups = [];
    sorted.forEach(post => {
        const key = new Date(post.created_at).toDateString();
        const last = groups[groups.length - 1];
        if (last && last.key === key) last.posts.push(post);
        else groups.push({ key, date: new Date(post.created_at), posts: [post] });
    });

    let i = 0;
    container.innerHTML = groups.map(g => `
        <section class="tl-day" aria-label="${escapeHtml(dayLabel(g.date))}">
            <h2 class="tl-day-head">
                <span class="tl-day-date">${escapeHtml(g.date.toLocaleDateString("en-US", { month: "short", day: "numeric" }))}</span>
                <span class="tl-day-meta">
                    <span>${escapeHtml(g.date.toLocaleDateString("en-US", { weekday: "long" }))}</span>
                    <span class="tl-day-ago">${escapeHtml(dayAgo(g.date))}</span>
                </span>
                <span class="tl-day-count">${g.posts.length} ${g.posts.length === 1 ? "post" : "posts"}</span>
            </h2>
            ${g.posts.map(p => postHtml(p, ++i)).join("")}
        </section>
    `).join("");

    container.querySelectorAll(".post-media img").forEach(img => {
        const drop = () => img.closest(".post-media")?.remove();
        if (img.complete && img.naturalWidth === 0) drop();
        else {
            img.addEventListener("error", drop, { once: true });
            img.addEventListener("load", () => img.closest(".post-media")?.classList.add("loaded"), { once: true });
        }
    });

    animateIn(container);
    announce(posts.length);
}

function postHtml(post, i) {

    const acct = ACCOUNTS[post.account] || { logo: "logo.png", key: "other" };
    const url = safeUrl(post.post_url);
    const img = safeUrl(post.image_url);
    const platform = platformOf(url);
    const fresh = isNew(post);
    const name = escapeHtml(post.account || "Unknown");
    const handle = escapeHtml(post.username || "");

    return `
        <article class="tl-post tl-post--${acct.key}${fresh ? " is-new" : ""}" >
            <span class="tl-marker" aria-hidden="true"></span>
            <div class="post surface">
                <div class="post-head">
                    <span class="post-avatar"><img src="${acct.logo}" alt="" width="44" height="44" loading="lazy"></span>
                    <div class="post-who">
                        <h3 class="post-name">
                            ${name}
                            ${post.verified ? `<span class="post-verified" title="Verified account"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.6 11.2 3.4 8l1.1-1.1 2.1 2.1 4.9-4.9 1.1 1.1z"/></svg><span class="sr-only">Verified</span></span>` : ""}
                        </h3>
                        ${handle ? `<span class="post-handle">${handle}</span>` : ""}
                    </div>
                    <div class="post-meta">
                        ${fresh ? `<span class="pb-chip post-new"><span class="live-dot" aria-hidden="true"></span>New</span>` : ""}
                        ${platform ? `<span class="pb-chip post-platform">${escapeHtml(platform)}</span>` : ""}
                        <time class="post-time" datetime="${escapeHtml(post.created_at)}" title="${escapeHtml(fullDate(post.created_at))}">${escapeHtml(timeLabel(post.created_at))}</time>
                    </div>
                </div>

                <div class="post-body">
                    <p class="post-text">${linkify(post.content || "")}</p>
                </div>

                ${img ? `
                <figure class="post-media">
                    ${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" aria-label="Open image post from ${name} on ${escapeHtml(platform || "the source")}">` : ""}
                        <img src="${escapeHtml(img)}" alt="Image attached to ${name}'s post" loading="lazy" decoding="async" referrerpolicy="no-referrer">
                    ${url ? `</a>` : ""}
                </figure>` : ""}

                ${url ? `
                <div class="post-foot">
                    <a class="post-open" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">
                        View on ${escapeHtml(platform || "source")} <span aria-hidden="true">↗</span>
                    </a>
                    <span class="post-stamp">${escapeHtml(fullDate(post.created_at))}</span>
                </div>` : ""}
            </div>
        </article>`;
}

/* ---------- filters ---------- */
function setupFilters() {

    const buttons = document.querySelectorAll(".feed-tab");

    buttons.forEach(button => {
        button.addEventListener("click", () => {

            buttons.forEach(btn => {
                btn.classList.remove("active");
                btn.setAttribute("aria-pressed", "false");
            });
            button.classList.add("active");
            button.setAttribute("aria-pressed", "true");

            activeFilter = button.dataset.filter;

            const filtered = activeFilter === "All"
                ? allPosts
                : allPosts.filter(post => post.account === activeFilter);

            renderSocialFeed(filtered);
        });
    });
}

function announce(n) {
    const el = document.getElementById("feedAnnounce");
    if (el) el.textContent = `Showing ${n} ${n === 1 ? "post" : "posts"}${activeFilter === "All" ? "" : " from " + activeFilter}.`;
}

/* ---------- entrance: quick rise, staggered, triggers early ---------- */
function animateIn(container) {
    const items = container.querySelectorAll(".tl-post, .tl-day-head");
    if (prefersReducedMotion || !("IntersectionObserver" in window)) {
        items.forEach(el => el.classList.add("in"));
        return;
    }
    container.classList.add("anim");
    const io = new IntersectionObserver(entries => {
        let n = 0;
        entries.forEach(e => {
            if (e.isIntersecting) {
                // stagger within each batch that enters together, ~35ms apart
                e.target.style.setProperty("--d", `${Math.min(n++, 10) * 35}ms`);
                e.target.classList.add("in");
                io.unobserve(e.target);
            }
        });
    }, { rootMargin: "0px 0px 15% 0px" });
    items.forEach(el => io.observe(el));
}

/* ---------- text: escape, then link URLs, @handles, #tags ---------- */
function linkify(raw) {
    const re = /(https?:\/\/[^\s<>"']+)|(^|[^\w@])@(\w{1,15})|(^|[^\w&#])#([A-Za-z]\w*)/g;
    let out = "";
    let last = 0;
    let m;
    while ((m = re.exec(raw)) !== null) {
        out += escapeHtml(raw.slice(last, m.index));
        if (m[1]) {
            let href = m[1];
            let tail = "";
            const trail = href.match(/[.,!?;:)\]]+$/);
            if (trail) { tail = trail[0]; href = href.slice(0, -tail.length); }
            const shown = href.replace(/^https?:\/\/(www\.)?/, "").replace(/\?.*$/, "");
            out += `<a class="post-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer nofollow">${escapeHtml(shown.length > 38 ? shown.slice(0, 36) + "…" : shown)}</a>${escapeHtml(tail)}`;
        } else if (m[3]) {
            out += escapeHtml(m[2]) + `<a class="post-mention" href="https://x.com/${encodeURIComponent(m[3])}" target="_blank" rel="noopener noreferrer">@${escapeHtml(m[3])}</a>`;
        } else if (m[5]) {
            out += escapeHtml(m[4]) + `<a class="post-tag" href="https://x.com/hashtag/${encodeURIComponent(m[5])}" target="_blank" rel="noopener noreferrer">#${escapeHtml(m[5])}</a>`;
        }
        last = re.lastIndex;
    }
    out += escapeHtml(raw.slice(last));
    // a lone handle on its own line (how X copy-pastes mentions) reads better inline
    return out.replace(/\n(<a class="post-mention"[^>]*>[^<]*<\/a>)\s*\n/g, " $1 ");
}

function safeUrl(u) {
    if (!u) return "";
    try {
        const url = new URL(String(u), location.href);
        return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
    } catch (e) { return ""; }
}

function platformOf(u) {
    if (!u) return "";
    let host = "";
    try { host = new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return ""; }
    if (host === "x.com" || host.endsWith("twitter.com")) return "X";
    if (host.includes("instagram")) return "Instagram";
    if (host.includes("youtube") || host === "youtu.be") return "YouTube";
    if (host.includes("tiktok")) return "TikTok";
    if (host.includes("bsky")) return "Bluesky";
    if (host.includes("threads")) return "Threads";
    return host;
}

/* ---------- time ---------- */
function shortAgo(iso) {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return "Now";
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    const d = Math.floor(s / 86400);
    if (d < 7) return `${d}d`;
    if (d < 60) return `${Math.floor(d / 7)}w`;
    return `${Math.floor(d / 30)}mo`;
}

// on the post: relative while it's fresh, clock time once the day header carries the date
function timeLabel(iso) {
    const d = new Date(iso);
    const s = (Date.now() - d.getTime()) / 1000;
    if (s < 60) return "Just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function dayAgo(date) {
    const startOf = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const days = Math.round((startOf(new Date()) - startOf(date)) / 86400000);
    if (days <= 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;
    if (days < 60) { const w = Math.floor(days / 7); return `${w} ${w === 1 ? "week" : "weeks"} ago`; }
    const mo = Math.floor(days / 30);
    if (mo < 12) return `${mo} months ago`;
    return date.getFullYear().toString();
}

function dayLabel(date) {
    return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function fullDate(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        + " · " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// kept for anything else that may call it
function formatTimeAgo(dateString) {
    return timeLabel(dateString);
}
