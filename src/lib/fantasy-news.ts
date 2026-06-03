/**
 * src/lib/fantasy-news.ts
 *
 * Aggregates Google News RSS feeds for fantasy-relevant MLB stories:
 * injuries, lineup news, call-ups, demotions, trades.
 *
 * Re-uses the Google News RSS pattern used elsewhere in the codebase
 * (e.g. team pages) — no new infrastructure required.
 */

import { XMLParser } from 'fast-xml-parser'

export type NewsItem = {
  title: string
  link: string
  source: string
  publishedAt: string  // ISO timestamp
  publishedDisplay: string  // 'Today, 14:30' or '2 hours ago'
  category: 'injury' | 'lineup' | 'transaction' | 'general'
}

const FEEDS = [
  { url: 'https://news.google.com/rss/search?q=MLB+injury+report&hl=en-US&gl=US&ceid=US:en', category: 'injury' as const },
  { url: 'https://news.google.com/rss/search?q=MLB+lineup+confirmed+OR+scratched&hl=en-US&gl=US&ceid=US:en', category: 'lineup' as const },
  { url: 'https://news.google.com/rss/search?q=MLB+called+up+OR+designated+for+assignment+OR+traded&hl=en-US&gl=US&ceid=US:en', category: 'transaction' as const },
  { url: 'https://news.google.com/rss/search?q=MLB+fantasy+baseball&hl=en-US&gl=US&ceid=US:en', category: 'general' as const },
]

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diffMs = now - then

  if (diffMs < 0) return 'Just now'
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function extractSource(title: string): { cleanTitle: string; source: string } {
  // Google News RSS format: "Article Title - Source Name"
  const match = title.match(/^(.+?) - ([^-]+)$/)
  if (match) {
    return { cleanTitle: match[1].trim(), source: match[2].trim() }
  }
  return { cleanTitle: title, source: 'Google News' }
}

async function fetchFeed(url: string, category: NewsItem['category']): Promise<NewsItem[]> {
  try {
    const res = await fetch(url, { next: { revalidate: 900 } }) // 15-min cache
    if (!res.ok) return []
    const xml = await res.text()
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' })
    const parsed = parser.parse(xml)
    const items = parsed?.rss?.channel?.item ?? []
    const list = Array.isArray(items) ? items : [items]

    return list.slice(0, 15).map((item: any) => {
      const { cleanTitle, source } = extractSource(item.title ?? '')
      const pubDate = item.pubDate ?? new Date().toISOString()
      const iso = new Date(pubDate).toISOString()
      return {
        title: cleanTitle,
        link: item.link ?? '',
        source,
        publishedAt: iso,
        publishedDisplay: formatRelativeTime(iso),
        category,
      }
    })
  } catch (e) {
    console.error('news feed fetch failed', url, e)
    return []
  }
}

export async function getFantasyNews(): Promise<NewsItem[]> {
  const results = await Promise.all(FEEDS.map(f => fetchFeed(f.url, f.category)))
  const flat = results.flat()

  // Dedupe by title (Google News often returns the same story across queries)
  const seen = new Set<string>()
  const unique: NewsItem[] = []
  for (const item of flat) {
    const key = item.title.toLowerCase().slice(0, 80)
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(item)
    }
  }

  // Sort newest first, cap at 40 items
  unique.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
  return unique.slice(0, 40)
}
