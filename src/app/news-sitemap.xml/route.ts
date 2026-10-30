// src/app/news-sitemap.xml/route.ts
//
// The Google News sitemap: published articles from the last 48 hours (never scheduled ones), newest first, at most 1000, in the news:news schema. The rules live in
// src/lib/seo/news.ts (tested). The full /sitemap.xml lists every article and page; this one is only the fresh ones, as Google News asks.

import { createAdminClient } from '@/lib/supabase'
import { NEWS_SITEMAP_MAX, NEWS_WINDOW_HOURS, newsSitemapXml } from '@/lib/seo/news'

export const dynamic = 'force-dynamic'

export async function GET() {
  const now = Date.now()
  const since = new Date(now - NEWS_WINDOW_HOURS * 3600 * 1000).toISOString()
  const { data, error } = await createAdminClient()
    .from('articles')
    .select('slug, title, published_at')
    .eq('status', 'published')
    .gte('published_at', since)
    .lte('published_at', new Date(now).toISOString())
    .order('published_at', { ascending: false })
    .limit(NEWS_SITEMAP_MAX)
  if (error) console.error('[news-sitemap] Supabase error:', error.message)   // an empty, valid sitemap is better than an error page for the crawler
  const xml = newsSitemapXml((data ?? []) as { slug: string; title: string; published_at: string }[], now)
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=600' } })
}
