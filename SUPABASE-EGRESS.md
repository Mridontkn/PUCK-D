# Cutting Supabase egress

Supabase flagged overage on **egress** (data downloaded from Supabase). Almost all of it was article photos plus full article text being downloaded on every visit.

## What was heavy (per homepage visit)

| What | Before | Why |
|---|---|---|
| Hero + 5 story photos | ~2.9 MB | Full-size uploads (up to 2.8 MB PNGs), served `no-cache`, so re-downloaded on every visit |
| Article list | 163 KB | `select('*')` pulled every article's full body just to show "3 MIN READ" |

The Articles page was worse: it loaded all ~67 photos at full size at once.

## What changed

1. **Photos go through Netlify Image CDN.** `imgSrc()` in `script.js` points Supabase photos at `/.netlify/images?url=…&w=…`. Netlify fetches the original once, resizes it, converts it to WebP/AVIF and caches it. `netlify.toml` allows those image URLs.
2. **Lists only fetch the columns they show.** The homepage, Articles page, search and related stories no longer download article bodies. The duplicate `api.js` was removed.
3. **Articles page photos lazy-load.** They download only when scrolled into view.
4. **New uploads are smaller.** The admin page shrinks photos to 1600px WebP before uploading and marks them cacheable for a year.
5. **Read time is stored, not computed.** There's a new `read_minutes` column, which the admin page fills on publish.

## One-time step: run this SQL

Supabase dashboard → **SQL Editor** → paste and run:

```sql
alter table public.article add column if not exists read_minutes integer;

update public.article
set read_minutes = greatest(1, round(
  coalesce(array_length(regexp_split_to_array(
    btrim(regexp_replace(coalesce(context, ''), '<[^>]*>', ' ', 'g')), '\s+'), 1), 0) / 200.0
))::int
where read_minutes is null;
```

Until this runs, the site still works. Cards just hide the read time.

## Checking it worked (after deploy)

- Article photos on puckd.blog should load from `/.netlify/images?...`. Check in the browser's Network tab.
- Supabase dashboard → **Usage** → Egress should flatten out within a day or two.
