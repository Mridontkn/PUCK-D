/* ============================================================
   PUCK'D Sweet 16 — weekly power rankings
   Data: Supabase `power_rankings` (rank, team, movement, record, updated)
   Enrichment (optional): same-origin NHL standings proxy, matched by full team name
   ============================================================ */

const rankingsContainer = document.getElementById("powerRankings");
const updatedDate = document.getElementById("updatedDate");
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

/* ---------- team colours (primaries, dark navies lifted so they read on dark) ---------- */

const PR_COLORS = {
    ANA: "#F47A38", BOS: "#FFB81C", BUF: "#2E6FD8", CGY: "#D2001C", CAR: "#CE1126", CHI: "#CF0A2C",
    COL: "#A6334F", CBJ: "#CE1126", DAL: "#00A06B", DET: "#CE1126", EDM: "#FF4C00", FLA: "#C8102E",
    LAK: "#A2AAAD", MIN: "#2E8B57", MTL: "#AF1E2D", NSH: "#FFB81C", NJD: "#CE1126", NYI: "#F47D30",
    NYR: "#2D5BD7", OTT: "#C52032", PHI: "#F74902", PIT: "#FCB514", SJS: "#00A3AD", SEA: "#99D9D9",
    STL: "#3A6FD8", TBL: "#2F6BD8", TOR: "#3A6AD9", UTA: "#71AFE5", VAN: "#00A14B", VGK: "#B4975A",
    WSH: "#C8102E", WPG: "#7BAFD4"
};
// Only values from the table above ever reach a style attribute.
function prTc(live) {
    const c = live && PR_COLORS[live.abbr];
    return c ? `--tc:${c};` : "";
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

function prStats(live) {
    if (!live) return "";
    const cells = [
        live.pts !== null ? `<div><dt>Pts</dt><dd>${live.pts}</dd></div>` : "",
        live.l10 ? `<div><dt>L10</dt><dd>${prEsc(live.l10)}</dd></div>` : "",
        live.streak ? `<div><dt>Strk</dt><dd class="pr-strk pr-strk--${live.streakKind}">${prEsc(live.streak)}</dd></div>` : "",
        live.gd !== null ? `<div><dt>Diff</dt><dd>${prGd(live.gd)}</dd></div>` : ""
    ].join("");
    return cells ? `<dl class="pr-stats">${cells}</dl>` : "";
}

function prChips(team, rank, mv, live) {
    return `
    <div class="pr-chips">
        ${team.record ? `<span class="pr-chip"><b>${prEsc(team.record)}</b></span>` : ""}
        <span class="pr-chip">${prEsc(prLastWeek(rank, mv))}</span>
        ${live && live.division ? `<span class="pr-chip">${prEsc(live.division)}</span>` : ""}
    </div>`;
}

// #1 gets the feature card; #2–3 get the compact version of the same card
function prPodium(team, i) {
    const rank = Number(team.rank) || i + 1;
    const mv = prMove(team.movement);
    const live = team._live;
    const lead = i === 0;
    return `
<li class="pr-card${lead ? " pr-card--lead" : ""}${live && PR_COLORS[live.abbr] ? " has-tc" : ""}" style="--i:${i};${prTc(live)}">
    <span class="pr-big-rank" aria-hidden="true">${rank}</span>
    <div class="pr-card-shot">${prLogo(live, "pr-card-logo")}</div>
    <div class="pr-card-body">
        <div class="pr-card-top">
            <span class="pr-rank${lead ? " pr-rank--gold" : ""}">No. ${rank}</span>
            ${prMoveChip(mv)}
        </div>
        <h2 class="pr-card-name">${prName(team.team, live)}</h2>
        ${prChips(team, rank, mv, live)}
        ${prStats(live)}
    </div>
</li>`;
}

function prRow(team, i, maxPts) {
    const rank = Number(team.rank) || i + 1;
    const mv = prMove(team.movement);
    const live = team._live;
    const pts = live && live.pts !== null ? live.pts : null;
    const pct = pts !== null && maxPts ? Math.max(0, Math.min(1, pts / maxPts)) : 0;
    const ident = live && live.abbr
        ? `<span class="pr-abbr">${prEsc(live.abbr)}</span><span class="pr-tname">${prEsc(team.team)}</span>`
        : `<span class="pr-abbr pr-abbr--full">${prEsc(team.team)}</span>`;
    const logo = live && live.logo
        ? `<span class="pr-logo-tile"><img src="${prEsc(live.logo)}" alt="" width="34" height="34" loading="lazy" decoding="async"></span>`
        : `<span class="pr-logo-tile pr-logo-tile--blank" aria-hidden="true"></span>`;

    return `
<li class="pr-row is-${mv.kind}${live && PR_COLORS[live.abbr] ? " has-tc" : ""}" style="--i:${i};--pct:${pct.toFixed(3)};${prTc(live)}">
    <span class="pr-num"><span class="pr-sr">Rank </span>${rank}</span>
    <span class="pr-team">${logo}${ident}</span>
    <span class="pr-c pr-c--move">${prMoveChip(mv)}</span>
    <span class="pr-c pr-rec">${prEsc(team.record || "—")}</span>
    <span class="pr-c pr-pts pr-hide-sm">${pts !== null ? pts : "—"}</span>
    <span class="pr-c pr-l10 pr-hide-md">${live && live.l10 ? prEsc(live.l10) : "—"}</span>
    <span class="pr-c pr-strk pr-hide-md ${live && live.streak ? "pr-strk--" + live.streakKind : ""}">${live && live.streak ? prEsc(live.streak) : "—"}</span>
    ${pct ? `<i class="pr-bar" aria-hidden="true"></i>` : ""}
</li>`;
}

const PR_COLS = `
<div class="pr-cols" aria-hidden="true">
    <span>#</span><span>Team</span><span>Move</span><span>Rec</span>
    <span class="pr-hide-sm">Pts</span><span class="pr-hide-md">L10</span><span class="pr-hide-md">Strk</span>
</div>`;

function prMovers(data) {
    const items = data.map((t) => ({ t, mv: prMove(t.movement) }));
    const ups = items.filter((x) => x.mv.kind === "up").sort((a, b) => b.mv.n - a.mv.n);
    const downs = items.filter((x) => x.mv.kind === "down").sort((a, b) => b.mv.n - a.mv.n);
    const news = items.filter((x) => x.mv.kind === "new");
    const steady = items.filter((x) => x.mv.kind === "same");

    const short = (x) => (x.t._live && x.t._live.common) || x.t.team;
    const logoOf = (x) => x.t._live && x.t._live.logo
        ? `<img class="pr-mv-logo" src="${prEsc(x.t._live.logo)}" alt="" width="34" height="34" loading="lazy" decoding="async">` : "";
    const tile = (cls, label, num, team, logos = "", style = "") => `
        <div class="pr-mv${cls ? " pr-mv--" + cls : ""}${style ? " has-tc" : ""}"${style ? ` style="${style}"` : ""}>
            ${logos ? `<span class="pr-mv-logos">${logos}</span>` : ""}
            <span class="pr-mv-num">${num}</span>
            <span class="pr-mv-text">
                <span class="stat-label">${label}</span>
                <span class="pr-mv-team">${team}</span>
            </span>
        </div>`;
    const tiles = [];
    if (ups.length) tiles.push(tile("up", "Biggest climb",
        `<span class="pr-mv-arrow" aria-hidden="true">▲</span>${ups[0].mv.n}`,
        `${prEsc(short(ups[0]))} <em>#${Number(ups[0].t.rank)}</em>`, logoOf(ups[0]), prTc(ups[0].t._live)));
    if (downs.length) tiles.push(tile("down", "Biggest slide",
        `<span class="pr-mv-arrow" aria-hidden="true">▼</span>${downs[0].mv.n}`,
        `${prEsc(short(downs[0]))} <em>#${Number(downs[0].t.rank)}</em>`, logoOf(downs[0]), prTc(downs[0].t._live)));
    if (news.length) tiles.push(tile("new", "New to the 16", news.length,
        news.map((x) => prEsc(short(x))).join(", "), news.slice(0, 3).map(logoOf).join("")));
    tiles.push(tile("", "Holding steady", steady.length, `<em>of ${data.length}</em>`));
    return tiles.join("");
}

function prSkeleton() {
    const card = (lead) => `
        <li class="pr-card${lead ? " pr-card--lead" : ""} pr-card--sk" aria-hidden="true">
            <div class="pr-card-shot"><span class="sk pr-sk-logo"></span></div>
            <div class="pr-card-body">
                <span class="sk" style="width:64px;height:18px"></span>
                <span class="sk" style="width:${lead ? 46 : 70}%;height:${lead ? 54 : 30}px;margin-top:16px"></span>
                <span class="sk" style="width:${lead ? 50 : 80}%;height:20px;margin-top:14px"></span>
            </div>
        </li>`;
    const rows = Array.from({ length: 8 }, (_, i) => `
        <li class="pr-row pr-row--sk" aria-hidden="true">
            <span class="sk" style="width:14px;height:16px;margin:auto"></span>
            <span class="pr-team"><span class="sk" style="width:26px;height:26px"></span><span class="sk" style="width:${44 + (i % 3) * 12}%;height:13px"></span></span>
        </li>`).join("");
    rankingsContainer.innerHTML = `
<ol class="pr-podium">${card(true)}${card(false)}${card(false)}</ol>
<div class="pr-st">${PR_COLS}<ol class="pr-list">${rows}</ol></div>`;
}

function prMessage(title, text) {
    rankingsContainer.setAttribute("aria-busy", "false");
    rankingsContainer.innerHTML = `
<div class="pr-empty">
    <p class="pr-empty-title">${prEsc(title)}</p>
    <p class="pr-empty-text">${prEsc(text)}</p>
</div>`;
}

/* ---------- reveal: quick, early, staggered ---------- */

function prReveal() {
    const targets = rankingsContainer.querySelectorAll(".pr-card, .pr-st");
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
    data.forEach((team) => {
        team._live = prLive(prMatch(standings, team.team));
    });

    // podium (#1–3) + one tiered board (#4–16)
    const podium = data.filter((t) => Number(t.rank) <= 3);
    const rest = data.filter((t) => !(Number(t.rank) <= 3));
    const maxPts = Math.max(0, ...data.map((t) => (t._live && t._live.pts) || 0));

    let html = "";
    if (podium.length) {
        html += `<ol class="pr-podium">${podium.map(prPodium).join("")}</ol>`;
    }

    if (rest.length) {
        let board = "";
        let from = 4;
        let idx = 0;
        let groups = 0;
        PR_TIERS.slice(1).forEach((tier) => {
            const group = rest.filter((t) => {
                const r = Number(t.rank);
                return r >= from && r <= tier.to;
            });
            const lo = from;
            from = tier.to + 1;
            if (!group.length) return;
            const hi = Number(group[group.length - 1].rank);
            const range = lo === hi ? `#${lo}` : `#${lo}–${hi}`;
            const bubble = tier.to === Infinity;
            if (groups++) board += `<div class="pr-cut${bubble ? " pr-cut--bubble" : ""}" aria-hidden="true"></div>`;
            board += `<h3 class="pr-sub${bubble ? " pr-sub--bubble" : ""}">${prEsc(tier.name)}<span>${range}</span></h3>`;
            board += `<ol class="pr-list" start="${lo}">${group.map((t) => prRow(t, idx++, maxPts)).join("")}</ol>`;
        });
        // anything ranked outside the tiers (e.g. missing rank) still shows
        const stray = rest.filter((t) => !(Number(t.rank) >= 4));
        if (stray.length) board += `<ol class="pr-list">${stray.map((t) => prRow(t, idx++, maxPts)).join("")}</ol>`;
        html += `<section class="pr-st" aria-label="Ranks 4 to 16">${PR_COLS}${board}</section>`;
    }

    rankingsContainer.innerHTML = html;
    rankingsContainer.setAttribute("aria-busy", "false");

    moversBox.innerHTML = prMovers(data);
    moversBox.hidden = false;

    prReveal();
}

loadPowerRankings();
