import { describe, it, expect } from 'vitest'
import { OG_SIZES, buildNewsArticleJsonLd, checkNewsArticleJsonLd, excerptOf, heroUsable, newsEligible, newsSitemapXml, ogImageUrl, shareImage, showUpdated } from './news'

const body = { type: 'doc' as const, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Zack Wheeler changed his sinker shape this year and the pitches have produced more misses since. '.repeat(6) }] }] }
const art = (o: Record<string, unknown> = {}) => ({ slug: 'wheeler-sinker', title: 'Wheeler changed his sinker', excerpt: null, seo_description: null, body, hero_image: null, author: 'George', published_at: '2026-10-30T12:00:00.000Z', updated_at: '2026-10-30T12:05:00.000Z', sport: 'mlb', section: 'What changed', team_tags: ['PHI'], ...o }) as Parameters<typeof buildNewsArticleJsonLd>[0]

describe('share image', () => {
  const ours = 'https://proj.supabase.co/storage/v1/object/public/article-images/a.webp'
  it('uses the hero only when it is ours, measured and at least 1200x675', () => {
    expect(heroUsable({ hero_image: ours, hero_width: 1600, hero_height: 900 }, 'proj.supabase.co')).toBe(true)
    expect(heroUsable({ hero_image: ours, hero_width: 1000, hero_height: 900 }, 'proj.supabase.co')).toBe(false)     // too narrow
    expect(heroUsable({ hero_image: ours, hero_width: null, hero_height: null }, 'proj.supabase.co')).toBe(false)    // unmeasured
    expect(heroUsable({ hero_image: 'https://other.com/x.jpg', hero_width: 2000, hero_height: 1200 }, 'proj.supabase.co')).toBe(false)   // hot-linked
  })
  it('falls back to the generated 1200x675 card with an absolute URL', () => {
    const s = shareImage(art())
    expect(s.url).toMatch(/^https:\/\/xlab9\.com\/articles\/wheeler-sinker\/og\?v=\d+$/)
    expect([s.width, s.height]).toEqual([1200, 675])
  })
  it('names the other two ratios', () => {
    expect(ogImageUrl(art(), '1x1')).toContain('r=1x1'); expect(OG_SIZES['4x3'].height).toBe(900)
  })
})

describe('excerpt', () => {
  it('is never longer than 200 characters and ends cleanly', () => {
    const e = excerptOf(art())
    expect(e.length).toBeLessThanOrEqual(200); expect(e.endsWith('…')).toBe(true)
  })
  it('prefers the stored excerpt', () => { expect(excerptOf(art({ excerpt: 'Short and sweet.' }))).toBe('Short and sweet.') })
})

describe('NewsArticle JSON-LD', () => {
  const j = buildNewsArticleJsonLd(art())
  it('has everything Google lists, with ISO dates, an author with a url, a publisher logo and three images', () => {
    expect(j['@type']).toBe('NewsArticle'); expect(j.datePublished).toBe('2026-10-30T12:00:00.000Z'); expect(j.dateModified).toBe('2026-10-30T12:05:00.000Z')
    expect(j.author[0]).toMatchObject({ '@type': 'Person', name: 'George', url: 'https://xlab9.com/authors/george' })
    expect(j.publisher.logo.url).toMatch(/^https:\/\//); expect(j.image).toHaveLength(3); expect(j.publisher.name).toBe('x9Lab')
    expect(checkNewsArticleJsonLd(j)).toEqual({ errors: [], warnings: [] })
  })
  it('flags a missing date as an error', () => {
    const bad = buildNewsArticleJsonLd(art({ published_at: null }))
    expect(checkNewsArticleJsonLd(bad).errors.join(' ')).toMatch(/datePublished/)
  })
})

describe('updated rule and news sitemap', () => {
  it('shows Updated only when the change came an hour or more after publishing', () => {
    expect(showUpdated({ published_at: '2026-10-30T12:00:00Z', updated_at: '2026-10-30T12:20:00Z' })).toBe(false)
    expect(showUpdated({ published_at: '2026-10-30T12:00:00Z', updated_at: '2026-10-30T14:00:00Z' })).toBe(true)
  })
  const now = Date.parse('2026-10-30T20:00:00Z')
  const items = [{ slug: 'a', title: 'A & B', published_at: '2026-10-30T10:00:00Z' }, { slug: 'old', title: 'Old', published_at: '2026-10-27T10:00:00Z' }, { slug: 'later', title: 'Scheduled', published_at: '2026-10-31T10:00:00Z' }]
  it('lists only articles from the last 48 hours, not scheduled ones, newest first', () => {
    expect(newsEligible(items, now).map(i => i.slug)).toEqual(['a'])
  })
  it('writes the news schema with an escaped title and the publication name and language', () => {
    const x = newsSitemapXml(items, now)
    expect(x).toContain('xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"')
    expect(x).toContain('<news:name>x9Lab</news:name><news:language>en</news:language>')
    expect(x).toContain('<news:title>A &amp; B</news:title>'); expect(x).toContain('<news:publication_date>2026-10-30T10:00:00.000Z</news:publication_date>')
    expect(x).not.toContain('old'); expect(x).not.toContain('Scheduled')
  })
})
