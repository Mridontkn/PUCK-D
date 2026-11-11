// Netlify Edge Function: give each article its own share preview.
// Social crawlers (X, Discord, iMessage, Slack) don't run JavaScript, so the
// article's headline, summary and photo are written into article.html's
// <!-- seo:start --> … <!-- seo:end --> block before the page is sent.
// Any problem → the original page is returned untouched.

const SUPABASE_URL = "https://otnnyxtttsiypjskrshw.supabase.co";
// Public "publishable" key, the same one the site already ships in supabase.js.
const SUPABASE_KEY = "sb_publishable_cM5C9YCHNKdz8DvjFSJ_PQ_eA-wQ76P";
const SITE = "https://puckd.blog";

const esc = value => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// JSON inside <script> must never contain "</script>"
const safeJson = obj => JSON.stringify(obj).replace(/</g, "\\u003c");

export function buildTags(article, slug) {
    const pageUrl = `${SITE}/article.html?slug=${encodeURIComponent(slug)}`;
    const title = `${article.title} | PUCK'D`;
    const desc = String(article.summary || "NHL news and analysis from PUCK'D.").slice(0, 300);
    const image = /^https:\/\//.test(article.image_url || "") ? article.image_url : `${SITE}/og-image.png`;
    const published = article.created_at ? new Date(article.created_at).toISOString() : null;

    const ld = {
        "@context": "https://schema.org",
        "@type": "NewsArticle",
        headline: String(article.title).slice(0, 110),
        description: desc,
        image: [image],
        mainEntityOfPage: pageUrl,
        url: pageUrl,
        ...(published ? { datePublished: published, dateModified: published } : {}),
        ...(article.author ? { author: [{ "@type": "Person", name: article.author }] } : {}),
        ...(article.category ? { articleSection: article.category } : {}),
        publisher: {
            "@type": "NewsMediaOrganization",
            "@id": `${SITE}/#org`,
            name: "PUCK'D",
            logo: { "@type": "ImageObject", url: `${SITE}/logo.png` }
        }
    };

    return {
        title,
        tags: `<!-- seo:start -->
    <meta name="description" content="${esc(desc)}">
    <link rel="canonical" href="${esc(pageUrl)}">
    <meta name="robots" content="index, follow, max-image-preview:large">
    <meta property="og:type" content="article">
    <meta property="og:site_name" content="PUCK'D">
    <meta property="og:locale" content="en_US">
    <meta property="og:title" content="${esc(article.title)}">
    <meta property="og:description" content="${esc(desc)}">
    <meta property="og:url" content="${esc(pageUrl)}">
    <meta property="og:image" content="${esc(image)}">
    <meta property="og:image:alt" content="${esc(article.title)}">
    ${published ? `<meta property="article:published_time" content="${esc(published)}">` : ""}
    ${article.category ? `<meta property="article:section" content="${esc(article.category)}">` : ""}
    ${article.author ? `<meta name="author" content="${esc(article.author)}">` : ""}
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:site" content="@puckd_">
    <meta name="twitter:title" content="${esc(article.title)}">
    <meta name="twitter:description" content="${esc(desc)}">
    <meta name="twitter:image" content="${esc(image)}">
    <script type="application/ld+json">${safeJson(ld)}</script>
    <!-- seo:end -->`
    };
}

export function rewrite(html, article, slug) {
    const { title, tags } = buildTags(article, slug);
    if (!/<!-- seo:start -->[\s\S]*?<!-- seo:end -->/.test(html)) return null;
    return html
        .replace(/<!-- seo:start -->[\s\S]*?<!-- seo:end -->/, () => tags)
        .replace(/<title>[\s\S]*?<\/title>/, () => `<title>${esc(title)}</title>`);
}

export default async (request, context) => {
    const response = await context.next();
    try {
        const slug = new URL(request.url).searchParams.get("slug");
        if (!slug || slug.length > 200) return response;
        if (!(response.headers.get("content-type") || "").includes("text/html")) return response;

        const api = `${SUPABASE_URL}/rest/v1/article`
            + `?select=title,summary,image_url,author,created_at,category`
            + `&web_link=eq.${encodeURIComponent(slug)}&limit=1`;
        const res = await fetch(api, {
            headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
        });
        if (!res.ok) return response;
        const rows = await res.json();
        const article = Array.isArray(rows) ? rows[0] : null;
        if (!article || !article.title) return response;

        const html = await response.clone().text();
        const out = rewrite(html, article, slug);
        if (!out) return response;

        const headers = new Headers(response.headers);
        headers.delete("content-length");
        return new Response(out, { status: response.status, headers });
    } catch (err) {
        console.error("article-meta", err);
        return response;
    }
};

export const config = { path: ["/article.html", "/article"] };
