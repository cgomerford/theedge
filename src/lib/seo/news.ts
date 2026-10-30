// src/lib/seo/news.ts
//
// Everything that makes an article eligible for Google News and gives it a proper link preview, as pure functions (so it is tested): the share image choice, the
// description, the NewsArticle and Organization JSON-LD, the Google News sitemap, and the "updated" rule. The route files only call these.
//
// Share image rule: a hero is used only when it is hosted on our own storage and measured at 1200x675 or larger. Anything else (hot-linked from another site, unmeasured,
// too small, or no hero) gets the generated card at /articles/<slug>/og, which has no team logos or headshots. Descriptions of what the data shows, never a forecast.

import type { Article } from '@/lib/articles'
import { docText } from '@/lib/article-doc'
import { authorFor } from '@/lib/authors'
import { SITE_LOGO_SIZE, SITE_LOGO_URL, SITE_NAME, SITE_URL, X_URL } from '@/lib/site'

export const OG_SIZES = { '16x9': { width: 1200, height: 675 }, '4x3': { width: 1200, height: 900 }, '1x1': { width: 1200, height: 1200 } } as const
export type OgRatio = keyof typeof OG_SIZES
export const HERO_MIN = { width: 1200, height: 675 } as const
export const EXCERPT_MAX = 200
/** Google News lists articles from roughly the last two days; the news sitemap does the same, max 1000 URLs. */
export const NEWS_WINDOW_HOURS = 48
export const NEWS_SITEMAP_MAX = 1000
/** "Updated" is only shown when the article changed at least this long after it went live (autosaves and typo fixes in the first hour are not news). */
export const UPDATED_AFTER_MS = 60 * 60 * 1000

type A = Pick<Article, 'slug' | 'title' | 'excerpt' | 'seo_description' | 'body' | 'hero_image' | 'author' | 'published_at' | 'updated_at' | 'sport' | 'section' | 'team_tags'> & { hero_width?: number | null; hero_height?: number | null; hero_alt?: string | null }

export const articlePath = (slug: string) => `/articles/${slug}`
export const articleUrl = (slug: string) => `${SITE_URL}${articlePath(slug)}`
export const authorUrl = (name: string) => `${SITE_URL}/authors/${authorFor(name).slug}`
/** "MLB" for the sport column (the section Google News and the byline show). */
export const sectionLabel = (a: Pick<A, 'sport'>) => (a.sport ? a.sport.toUpperCase() : 'MLB')

/** Share-card URL; `v` is the updated time in seconds so X and others re-fetch it when the headline changes. */
export function ogImageUrl(a: Pick<A, 'slug' | 'updated_at'>, ratio: OgRatio = '16x9'): string {
  const v = Math.floor(Date.parse(a.updated_at) / 1000)
  const q = new URLSearchParams()
  if (ratio !== '16x9') q.set('r', ratio)
  if (Number.isFinite(v)) q.set('v', String(v))
  const qs = q.toString()
  return `${articleUrl(a.slug)}/og${qs ? `?${qs}` : ''}`
}

/** Is the hero good enough to be the share image? Ours, measured, and at least 1200x675. */
export function heroUsable(a: Pick<A, 'hero_image' | 'hero_width' | 'hero_height'>, storageHost: string | null = storageHostFromEnv()): boolean {
  if (!a.hero_image || !a.hero_width || !a.hero_height) return false
  if (a.hero_width < HERO_MIN.width || a.hero_height < HERO_MIN.height) return false
  try { return !!storageHost && new URL(a.hero_image).host === storageHost } catch { return false }
}
function storageHostFromEnv(): string | null {
  try { return process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host : null } catch { return null }
}

export function shareImage(a: A): { url: string; width: number; height: number; alt: string } {
  if (heroUsable(a)) return { url: a.hero_image as string, width: a.hero_width as number, height: a.hero_height as number, alt: a.hero_alt || a.title }
  return { url: ogImageUrl(a), ...OG_SIZES['16x9'], alt: a.title }
}

/** The excerpt, at most EXCERPT_MAX characters: the stored excerpt, else the search description, else the first words of the article, cut at a word. */
export function excerptOf(a: Pick<A, 'excerpt' | 'seo_description' | 'body'>): string {
  const raw = (a.excerpt?.trim() || a.seo_description?.trim() || docText(a.body).replace(/\s+/g, ' ').trim())
  if (raw.length <= EXCERPT_MAX) return raw
  const cut = raw.slice(0, EXCERPT_MAX - 1)
  const sp = cut.lastIndexOf(' ')
  return `${cut.slice(0, sp > 120 ? sp : cut.length).replace(/[\s,;:.-]+$/, '')}…`
}
export const descriptionOf = (a: Pick<A, 'excerpt' | 'seo_description' | 'body'>) => a.seo_description?.trim() || excerptOf(a)

export function showUpdated(a: Pick<A, 'published_at' | 'updated_at'>): boolean {
  const p = Date.parse(a.published_at ?? ''), u = Date.parse(a.updated_at)
  return Number.isFinite(p) && Number.isFinite(u) && u - p >= UPDATED_AFTER_MS
}

/** ISO 8601 with a timezone (always UTC, "Z"). */
export const iso = (s: string | null): string | undefined => { const t = s ? Date.parse(s) : NaN; return Number.isFinite(t) ? new Date(t).toISOString() : undefined }

export function buildNewsArticleJsonLd(a: A) {
  const img = shareImage(a)
  const images = [img.url, ogImageUrl(a, '4x3'), ogImageUrl(a, '1x1')]
  const au = authorFor(a.author)
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    mainEntityOfPage: { '@type': 'WebPage', '@id': articleUrl(a.slug) },
    headline: a.title.length > 110 ? `${a.title.slice(0, 107)}…` : a.title,   // Google asks for 110 characters or fewer
    description: descriptionOf(a),
    image: images,
    datePublished: iso(a.published_at),
    dateModified: iso(a.updated_at) ?? iso(a.published_at),
    author: [{ '@type': 'Person', name: au.name, url: `${SITE_URL}/authors/${au.slug}` }],
    publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL, logo: { '@type': 'ImageObject', url: SITE_LOGO_URL, width: SITE_LOGO_SIZE.width, height: SITE_LOGO_SIZE.height } },
    articleSection: sectionLabel(a),
    inLanguage: 'en',
    isAccessibleForFree: true,
    url: articleUrl(a.slug),
  }
}

export function buildOrganizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    logo: { '@type': 'ImageObject', url: SITE_LOGO_URL, width: SITE_LOGO_SIZE.width, height: SITE_LOGO_SIZE.height },
    sameAs: [X_URL],
    description: 'Independent baseball analytics built on public game data. Not affiliated with MLB.',
  }
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

/** Articles that belong in the Google News sitemap: published in the last 48 hours (and not scheduled for later), newest first, at most 1000. */
export function newsEligible<T extends { published_at: string | null }>(items: T[], now = Date.now()): T[] {
  const lo = now - NEWS_WINDOW_HOURS * 3600 * 1000
  return items
    .filter(i => { const t = Date.parse(i.published_at ?? ''); return Number.isFinite(t) && t >= lo && t <= now })
    .sort((a, b) => Date.parse(b.published_at as string) - Date.parse(a.published_at as string))
    .slice(0, NEWS_SITEMAP_MAX)
}

export function newsSitemapXml(items: Pick<A, 'slug' | 'title' | 'published_at'>[], now = Date.now()): string {
  const rows = newsEligible(items, now).map(a => [
    '  <url>',
    `    <loc>${xml(articleUrl(a.slug))}</loc>`,
    '    <news:news>',
    `      <news:publication><news:name>${xml(SITE_NAME)}</news:name><news:language>en</news:language></news:publication>`,
    `      <news:publication_date>${iso(a.published_at)}</news:publication_date>`,
    `      <news:title>${xml(a.title)}</news:title>`,
    '    </news:news>',
    '  </url>',
  ].join('\n'))
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n${rows.join('\n')}${rows.length ? '\n' : ''}</urlset>\n`
}

/** JSON-LD checks against what Google lists for NewsArticle (required and recommended properties). Returns problems; empty = nothing to fix. */
export function checkNewsArticleJsonLd(j: ReturnType<typeof buildNewsArticleJsonLd>): { errors: string[]; warnings: string[] } {
  const errors: string[] = [], warnings: string[] = []
  if (!j.headline) errors.push('headline missing')
  if (!j.image?.length) errors.push('image missing')
  if (!j.datePublished) errors.push('datePublished missing or not ISO 8601')
  if (!j.author?.[0]?.name) errors.push('author name missing')
  if (!j.author?.[0]?.url) warnings.push('author url missing')
  if (!j.dateModified) warnings.push('dateModified missing')
  if (!j.publisher?.name) warnings.push('publisher name missing')
  if (!j.publisher?.logo?.url) warnings.push('publisher logo missing')
  if (!j.description) warnings.push('description missing')
  if (j.headline.length > 110) warnings.push('headline over 110 characters')
  return { errors, warnings }
}
