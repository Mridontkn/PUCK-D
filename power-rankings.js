/* ============================================================
   PUCK'D Sweet 16 — weekly power rankings
   Data: Supabase `power_rankings` (rank, team, movement, record, updated)
   Enrichment (optional): same-origin NHL standings proxy, matched by full team name
   ============================================================ */

const rankingsContainer = document.getElementById("powerRankings");
const updatedDate = document.getElementById("updatedDate");
const metaRow = document.getElementById("prMeta");
const moversBox = document.getElementById("prMovers");

const PR_TIERS = [
    { name: "The Elite", to: 3 },
    { name: "Contenders", to: 8 },
    { name: "In the Mix", to: 12 },
    { name: "On the Bubble", to: Infinity }
];

const prEsc = (typeof escapeHtml === "function")
    ? escapeHtml
    : (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const prReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- helpers ---------- */

function prNorm(name) {
    return String(name || "")
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .toLowerCase().replace(/[^a-z0-9]/g, "");
}

// "2026-10-25" is a calendar date: parse it as local so it doesn't slip a day west of UTC
function prDate(value) {
    if (!value) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
    const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(value);
    return isNaN(d) ? null : d;
}

function prMove(raw) {
    if (raw === null || raw === undefined || raw === "") return { kind: "new" };
    const n = Number(raw);
    if (!Number.isFinite(n)) return { kind: "new" };
    if (n > 0) return { kind: "up", n };
    if (n < 0) return { kind: "down", n: Math.abs(n) };
    return { kind: "same", n: 0 };
}

function prMoveChip(mv) {
    switch (mv.kind) {
        case "up":
            return `<span class="pr-move pr-move--up" aria-label="Up ${mv.n} from last week"><span aria-hidden="true">▲</span>${mv.n}</span>`;
        case "down":
            return `<span class="pr-move pr-move--down" aria-label="Down ${mv.n} from last week"><span aria-hidden="true">▼</span>${mv.n}</span>`;
        case "new":
            return `<span class="pr-move pr-move--new" aria-label="New to the rankings">New</span>`;
        default:
            return `<span class="pr-move pr-move--same" aria-label="No change from last week"><span aria-hidden="true">—</span></span>`;
    }
}

function prLastWeek(rank, mv) {
    if (mv.kind === "new") return "Unranked";
    return `LW #${rank + (mv.kind === "up" ? mv.n : mv.kind === "down" ? -mv.n : 0)}`;
}

function prSafeLogo(url) {
    return /^https:\/\/assets\.nhle\.com\/[\w\/.\-]+\.svg$/.test(url || "") ? url : "";
}

/* ---------- standings enrichment (optional) ---------- */

async function prLoadStandings() {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
        const res = await fetch("/.netlify/functions/nhl?feed=standings", { signal: ctrl.signal });
        if (!res.ok) return null;
        const json = await res.json();
        const rows = Array.isArray(json && json.standings) ? json.standings : [];
        if (!rows.length) return null;
        const byFull = new Map();
        const byCommon = new Map();
        rows.forEach((s) => {
            const full = s.teamName && s.teamName.default;
            const common = s.teamCommonName && s.teamCommonName.default;
            if (full) byFull.set(prNorm(full), s);
            if (common) byCommon.set(prNorm(common), s);
        });
        return { byFull, byCommon };
    } catch (e) {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

function prMatch(st, teamName) {
    if (!st) return null;
    const key = prNorm(teamName);
    if (st.byFull.has(key)) return st.byFull.get(key);
    // fallback: ranked name ends with the club's common name ("Habs" won't match, "Montreal Canadiens" will)
    for (const [common, row] of st.byCommon) {
        if (common.length > 3 && key.endsWith(common)) return row;
    }
    return null;
}

function prLive(s) {
    if (!s) return null;
    const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
    const gd = num(s.goalDifferential);
    const code = String(s.streakCode || "").toUpperCase();
    const count = num(s.streakCount);
    return {
        abbr: (s.teamAbbrev && s.teamAbbrev.default) || "",
        place: (s.placeName && s.placeName.default) || "",
        common: (s.teamCommonName && s.teamCommonName.default) || "",
        logo: prSafeLogo(s.teamLogoDark || s.teamLogo),
        division: s.divisionName || "",
        pts: num(s.points),
        rec: [s.wins, s.losses, s.otLosses].every((v) => num(v) !== null) ? `${s.wins}-${s.losses}-${s.otLosses}` : "",
        l10: [s.l10Wins, s.l10Losses, s.l10OtLosses].every((v) => num(v) !== null) ? `${s.l10Wins}-${s.l10Losses}-${s.l10OtLosses}` : "",
        streak: code && count ? `${code}${count}` : "",
        streakKind: code === "W" ? "w" : code === "L" ? "l" : "ot",
        gd,
        wc: num(s.wildcardSequence)
    };
}

/* ---------- markup ---------- */

function prName(team, live) {
    // split "Carolina Hurricanes" into place + club when the standings row confirms it
    if (live && live.common && prNorm(team).endsWith(prNorm(live.common))) {
        const words = String(team).trim().split(/\s+/);
        const clubWords = live.common.trim().split(/\s+/).length;
        const place = words.slice(0, words.length - clubWords).join(" ");
        const club = words.slice(words.length - clubWords).join(" ");
        if (place) return `<span class="pr-place">${prEsc(place)}</span> <span class="pr-club">${prEsc(club)}</span>`;
    }
    return `<span class="pr-club">${prEsc(team)}</span>`;
}

function prLogo(live, cls) {
    if (!live || !live.logo) return `<span class="${cls} ${cls}--blank" aria-hidden="true"></span>`;
    return `<img class="${cls}" src="${prEsc(live.logo)}" alt="" width="64" height="64" loading="lazy" decoding="async">`;
}

function prGd(gd) {
    if (gd === null) return "";
    const cls = gd > 0 ? "pos" : gd < 0 ? "neg" : "";
    return `<span class="pr-gd ${cls}">${gd > 0 ? "+" : ""}${gd}</span>`;
}

function prPodium(team, i) {
    const rank = Number(team.rank) || i + 1;
    const mv = prMove(team.movement);
    const live = team._live;
    const stats = live ? `
        <dl class="pr-pod-stats">
            ${live.pts !== null ? `<div><dt>Pts</dt><dd>${live.pts}</dd></div>` : ""}
            ${live.l10 ? `<div><dt>L10</dt><dd>${prEsc(live.l10)}</dd></div>` : ""}
            ${live.streak ? `<div><dt>Strk</dt><dd class="pr-strk pr-strk--${live.streakKind}">${prEsc(live.streak)}</dd></div>` : ""}
            ${live.gd !== null ? `<div><dt>Diff</dt><dd>${prGd(live.gd)}</dd></div>` : ""}
        </dl>` : "";

    return `
<li class="pr-pod pr-pod--${rank}" style="--i:${i}">
    <span class="pr-pod-num" aria-hidden="true">${rank}</span>
    <span class="pr-sr">Rank ${rank}:</span>
    <div class="pr-pod-head">
        ${prLogo(live, "pr-pod-logo")}
        ${prMoveChip(mv)}
    </div>
    <h3 class="pr-pod-name">${prName(team.team, live)}</h3>
    <div class="pr-pod-chips">
        ${team.record ? `<span class="pr-chip"><b>${prEsc(team.record)}</b> at ranking</span>` : ""}
        <span class="pr-chip pr-chip--dim">${prEsc(prLastWeek(rank, mv))}</span>
        ${live && live.division ? `<span class="pr-chip pr-chip--dim">${prEsc(live.division)}</span>` : ""}
    </div>
    ${stats}
</li>`;
}

function prRow(team, i) {
    const rank = Number(team.rank) || i + 1;
    const mv = prMove(team.movement);
    const live = team._live;
    const sub = [prLastWeek(rank, mv), live && live.division].filter(Boolean).map(prEsc).join('<i class="pr-slash" aria-hidden="true"></i>');

    return `
<li class="pr-row" style="--i:${i}">
    <span class="pr-num" aria-hidden="true">${rank}</span>
    <span class="pr-sr">Rank ${rank}:</span>
    ${prLogo(live, "pr-logo")}
    <div class="pr-id">
        <h3 class="pr-name">${prName(team.team, live)}</h3>
        <p class="pr-sub">${sub}</p>
    </div>
    <div class="pr-cell pr-cell--move">${prMoveChip(mv)}</div>
    <div class="pr-cell pr-cell--rec"><span class="pr-k">Rec</span><span class="pr-v">${prEsc(team.record || "—")}</span></div>
    <div class="pr-cell pr-cell--live"><span class="pr-k">Pts</span><span class="pr-v pr-v--big">${live && live.pts !== null ? live.pts : "—"}</span></div>
    <div class="pr-cell pr-cell--live pr-hide-sm"><span class="pr-k">L10</span><span class="pr-v">${live && live.l10 ? prEsc(live.l10) : "—"}</span></div>
    <div class="pr-cell pr-cell--live pr-hide-sm"><span class="pr-k">Strk</span><span class="pr-v pr-strk ${live && live.streak ? "pr-strk--" + live.streakKind : ""}">${live && live.streak ? prEsc(live.streak) : "—"}</span></div>
</li>`;
}

function prTierHead(tier, from, to, idx) {
    const range = from === to ? `#${from}` : `#${from}–${to}`;
    return `
<div class="pr-tier-head" style="--i:${idx}">
    <h2 class="bc-title bc-title--sm pr-tier-title">${prEsc(tier.name)}</h2>
    <span class="pr-tier-range">${range}</span>
</div>`;
}

function prMovers(data) {
    const items = data.map((t) => ({ t, mv: prMove(t.movement) }));
    const ups = items.filter((x) => x.mv.kind === "up").sort((a, b) => b.mv.n - a.mv.n);
    const downs = items.filter((x) => x.mv.kind === "down").sort((a, b) => b.mv.n - a.mv.n);
    const news = items.filter((x) => x.mv.kind === "new");
    const steady = items.filter((x) => x.mv.kind === "same");

    const short = (x) => (x.t._live && x.t._live.common) || x.t.team;
    const tiles = [];
    if (ups.length) tiles.push(`
        <div class="pr-mv pr-mv--up">
            <span class="stat-label">Biggest climb</span>
            <span class="stat-num"><span class="pr-mv-arrow" aria-hidden="true">▲</span>${ups[0].mv.n}</span>
            <span class="pr-mv-team">${prEsc(short(ups[0]))} <em>to #${Number(ups[0].t.rank)}</em></span>
        </div>`);
    if (downs.length) tiles.push(`
        <div class="pr-mv pr-mv--down">
            <span class="stat-label">Biggest slide</span>
            <span class="stat-num"><span class="pr-mv-arrow" aria-hidden="true">▼</span>${downs[0].mv.n}</span>
            <span class="pr-mv-team">${prEsc(short(downs[0]))} <em>to #${Number(downs[0].t.rank)}</em></span>
        </div>`);
    if (news.length) tiles.push(`
        <div class="pr-mv pr-mv--new">
            <span class="stat-label">New to the 16</span>
            <span class="stat-num">${news.length}</span>
            <span class="pr-mv-team">${news.map((x) => prEsc(short(x))).join(", ")}</span>
        </div>`);
    tiles.push(`
        <div class="pr-mv">
            <span class="stat-label">Holding steady</span>
            <span class="stat-num">${steady.length}</span>
            <span class="pr-mv-team">of ${data.length} teams unchanged</span>
        </div>`);
    return tiles.join("");
}

function prSkeleton() {
    const pods = [0, 1, 2].map(() => `
        <li class="pr-pod pr-pod--sk" aria-hidden="true">
            <span class="sk" style="width:64px;height:64px"></span>
            <span class="sk" style="width:70%;height:34px;margin-top:22px"></span>
            <span class="sk" style="width:46%;height:14px;margin-top:14px"></span>
            <span class="sk" style="width:100%;height:40px;margin-top:26px"></span>
        </li>`).join("");
    const rows = Array.from({ length: 6 }, () => `
        <li class="pr-row pr-row--sk" aria-hidden="true">
            <span class="sk" style="width:44px;height:44px"></span>
            <span class="sk" style="width:36px;height:36px"></span>
            <span class="pr-id"><span class="sk" style="width:58%;height:18px"></span><span class="sk" style="width:30%;height:11px;margin-top:9px"></span></span>
        </li>`).join("");
    rankingsContainer.innerHTML = `<ol class="pr-podium">${pods}</ol><ol class="pr-list">${rows}</ol>`;
}

function prMessage(title, text) {
    rankingsContainer.setAttribute("aria-busy", "false");
    rankingsContainer.innerHTML = `
<div class="pr-empty surface">
    <p class="pr-empty-title">${prEsc(title)}</p>
    <p class="pr-empty-text">${prEsc(text)}</p>
</div>`;
}

/* ---------- reveal: quick, early, staggered ---------- */

function prReveal() {
    const targets = rankingsContainer.querySelectorAll(".pr-pod, .pr-row, .pr-tier-head");
    if (prReduced || !("IntersectionObserver" in window)) {
        targets.forEach((el) => el.classList.add("in"));
        return;
    }
    rankingsContainer.classList.add("pr-anim");
    const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
            if (!e.isIntersecting) return;
            e.target.classList.add("in");
            io.unobserve(e.target);
        });
    }, { rootMargin: "0px 0px 12% 0px" });
    targets.forEach((el) => io.observe(el));
}

/* ---------- main ---------- */

async function loadPowerRankings() {

    prSkeleton();

    const standingsPromise = prLoadStandings();

    const { data, error } = await db
        .from("power_rankings")
        .select("*")
        .order("rank");

    if (error) {
        console.error(error);
        updatedDate.textContent = "Board unavailable";
        prMessage("The board is offline", "We couldn't load this week's rankings. Refresh in a minute.");
        return;
    }

    if (!data || !data.length) {
        updatedDate.textContent = "No board yet";
        prMessage("No rankings posted yet", "The desk hasn't published this week's Sweet 16. Check back soon.");
        return;
    }

    const when = prDate(data[0].updated);
    updatedDate.textContent = when
        ? "Updated " + when.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        : "Latest board";

    const standings = await standingsPromise;
    let matched = 0;
    data.forEach((team) => {
        team._live = prLive(prMatch(standings, team.team));
        if (team._live) matched++;
    });

    if (matched) {
        metaRow.insertAdjacentHTML("beforeend",
            `<span class="pb-chip pb-chip--gold">Live NHL stats</span>`);
    }

    // podium (#1–3) + tiered list
    const podium = data.filter((t) => Number(t.rank) <= 3);
    const rest = data.filter((t) => !(Number(t.rank) <= 3));

    let html = "";
    if (podium.length) {
        html += prTierHead(PR_TIERS[0], 1, Math.max(...podium.map((t) => Number(t.rank) || 1)), 0);
        html += `<ol class="pr-podium">${podium.map(prPodium).join("")}</ol>`;
    }

    let from = 4;
    PR_TIERS.slice(1).forEach((tier, ti) => {
        const group = rest.filter((t) => {
            const r = Number(t.rank);
            return r >= from && r <= tier.to;
        });
        const lo = from;
        from = tier.to + 1;
        if (!group.length) return;
        const hi = Number(group[group.length - 1].rank);
        if (ti > 0) html += `<div class="pr-cut${tier.to === Infinity ? " pr-cut--bubble" : ""}" aria-hidden="true"></div>`;
        html += prTierHead(tier, lo, hi, 0);
        if (ti === 0) {
            html += `
<div class="pr-cols" aria-hidden="true">
    <span></span><span></span><span>Team</span><span>Move</span><span>Rec</span>
    <span class="pr-cols-live">Pts</span><span class="pr-cols-live pr-hide-sm">L10</span><span class="pr-cols-live pr-hide-sm">Strk</span>
</div>`;
        }
        html += `<ol class="pr-list" start="${lo}">${group.map(prRow).join("")}</ol>`;
    });

    rankingsContainer.innerHTML = html;
    rankingsContainer.setAttribute("aria-busy", "false");

    moversBox.innerHTML = prMovers(data);
    moversBox.hidden = false;

    prReveal();
}

loadPowerRankings();
