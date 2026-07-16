const ARTICLE_DATABASE_URL = './articles.json';
const DEFAULT_HERO_ID = 'a1';

const TICKER = [
  "FREE AGENCY WEEK 3 — SIGNINGS TRACKER LIVE",
  "ARBITRATION FILING DEADLINE THIS FRIDAY",
  "DEVELOPMENT CAMP ROSTERS NOW POSTED",
  "CAP CEILING PROJECTIONS UPDATED FOR NEXT SEASON",
  "PROSPECT RANKINGS: MIDSUMMER UPDATE",
  "RUMOR MILL: RESTRICTED FREE AGENT OFFER SHEETS"
];
const TRACKER_STATS = [
  { label: 'UFA Signings', stat: '38', unit: 'since July 1', note: '12 term deals, 26 one-year prove-it contracts' },
  { label: 'Cap Space Remaining', stat: '$412M', unit: 'league-wide', note: 'Down from $540M at open of free agency' },
  { label: 'Arbitration Filings', stat: '9', unit: 'cases pending', note: 'Hearings run through the end of the month' },
  { label: 'Days To Camp', stat: '58', unit: 'until rosters report', note: 'Development camps wrap up this week' }
];

const THUMB_SHAPES = {
  1: `<polygon points="0,150 60,20 110,20 70,150" fill="#E11D5C" opacity="0.8"/><polygon points="90,150 140,50 180,50 150,150" fill="#E8632C" opacity="0.55"/>`,
  2: `<polygon points="20,0 90,0 40,150 -10,150" fill="#E8632C" opacity="0.7"/><polygon points="120,0 200,0 200,60 150,150 100,150" fill="#E11D5C" opacity="0.45"/>`,
  3: `<polygon points="0,80 90,30 130,110 40,150" fill="#E11D5C" opacity="0.6"/><line x1="0" y1="40" x2="200" y2="40" stroke="#8A90A0" stroke-width="1"/>`
};

let articles = [];
let recentNews = [];
let heroId = null;

function escapeHtml(str){
  const d = document.createElement('div');
  d.textContent = str == null ? '' : String(str);
  return d.innerHTML;
}

function formatArticleLink(article){
  return `article.html?id=${encodeURIComponent(article.id)}`;
}

function formatRelativeDate(iso){
  if(!iso) return '';
  const d = new Date(iso);
  if(isNaN(d.getTime())) return String(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if(mins < 1) return 'NOW';
  if(mins < 60) return `${mins}M AGO`;
  const hours = Math.floor(mins / 60);
  if(hours < 24) return `${hours}H AGO`;
  const days = Math.floor(hours / 24);
  if(days === 1) return 'YESTERDAY';
  if(days < 7) return `${days} DAYS AGO`;
  return d.toLocaleDateString();
}

function estimateReadTime(html){
  const text = (html || '').replace(/<[^>]*>/g, ' ');
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / 200));
  return `${minutes} MIN READ`;
}

// Pulls published articles from the Supabase "article" table and maps
// them onto the shape the rest of this file expects (camelCase fields).
async function loadArticlesFromSupabase(){
  const { data, error } = await db
    .from('article')
    .select('*')
    .order('created_at', { ascending: false });

  if(error){
    console.error('Failed to load articles from Supabase', error);
    return [];
  }

  return (data || []).map((row, i) => ({
    id: row.id,
    tag: row.category || 'News',
    title: row.title,
    dek: row.summary,
    author: row.author,
    readTime: estimateReadTime(row.context),
    date: formatRelativeDate(row.created_at),
    thumb: (i % 3) + 1,
    imageUrl: row.image_url || null
  }));
}

async function loadRecentNews(){
  try{
    const response = await fetch(ARTICLE_DATABASE_URL);
    if(!response.ok) throw new Error('Fetch failed');
    const data = await response.json();
    return Array.isArray(data.recentNews) ? data.recentNews : [];
  }catch(err){
    console.error('Failed to load recent news', err);
    return [];
  }
}

async function loadData(){
  const [articleRows, newsRows] = await Promise.all([
    loadArticlesFromSupabase(),
    loadRecentNews()
  ]);
  articles = articleRows;
  recentNews = newsRows;
  heroId = articles.length ? articles[0].id : DEFAULT_HERO_ID;
}

function renderAll(){
  const hero = articles.find(a => a.id === heroId) || articles[0] || null;
  if(hero){
    document.getElementById('heroTitle').textContent = hero.title;
    document.getElementById('heroDek').textContent = hero.dek;
    document.getElementById('heroEyebrow').textContent = hero.tag + ' — Lead Story';
    document.getElementById('heroByline').innerHTML =
      `<b>${escapeHtml(hero.author)}</b> <span>·</span> <span>${escapeHtml(hero.readTime)}</span> <span>·</span> <span>${escapeHtml(hero.date)}</span>`;
  } else {
    document.getElementById('heroTitle').textContent = 'No article available';
    document.getElementById('heroDek').textContent = 'Publish your first article from the admin dashboard.';
    document.getElementById('heroEyebrow').textContent = 'News — Latest';
    document.getElementById('heroByline').textContent = '';
  }

  const rest = hero ? articles.filter(a => a.id !== hero.id) : articles;
  document.getElementById('articleList').innerHTML = rest.map(a => `
    <a class="article-row" href="${formatArticleLink(a)}">
      <div class="thumb"><svg viewBox="0 0 200 150" preserveAspectRatio="none"><rect width="200" height="150" fill="#1E2127"/>${THUMB_SHAPES[a.thumb] || THUMB_SHAPES[1]}</svg></div>
      <div class="article-body">
        <span class="tag">${escapeHtml(a.tag)}</span>
        <h3>${escapeHtml(a.title)}</h3>
        <p>${escapeHtml(a.dek)}</p>
        <div class="meta-row"><span>${escapeHtml(a.author)}</span><span class="dot-sep">·</span><span>${escapeHtml(a.readTime)}</span><span class="dot-sep">·</span><span>${escapeHtml(a.date)}</span></div>
      </div>
    </a>
  `).join('') || '<p style="color:var(--slate); padding:24px 0;">No articles yet — publish one from the admin dashboard.</p>';

  document.getElementById('recentNewsList').innerHTML = recentNews.map(item => `
    <div class="news-item">
      <div class="news-date">${escapeHtml(item.date || '')}</div>
      ${item.url ? `<a href="${escapeHtml(item.url)}">${escapeHtml(item.headline)}</a>` : `<div class="news-headline">${escapeHtml(item.headline)}</div>`}
    </div>
  `).join('') || '<p style="color:var(--slate); padding:24px 0;">No recent news yet — edit the JSON to add items.</p>';


  const tHTML = TICKER.map(t => `<span><b>${escapeHtml(t)}</b></span>`).join('<span class="chev">›</span>');
  document.getElementById('tickerTrack').innerHTML = tHTML + '<span class="chev">›</span>' + tHTML;
}

(async function init(){
  document.getElementById('heroTitle').textContent = 'Loading…';
  await loadData();
  renderAll();
})();
