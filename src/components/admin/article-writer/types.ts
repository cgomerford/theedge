import type { ArticleLayout } from '@/lib/articles'

export interface WriterMeta {
  title: string
  slug: string
  dek: string
  section: string
  layout: ArticleLayout
  excerpt: string
  seoDescription: string
  heroImage: string
  heroWidth: number | null
  heroHeight: number | null
  heroAlt: string
  teamTags: string[]
  author: string
  subjectPlayerId: string
  subjectPlayerName: string
}

export const SECTIONS = ['Matchup notes', 'Usage & role', 'How they win', "Where they're vulnerable", 'What changed', 'Situational', 'Venue', 'X-factor', 'What to watch', 'What we flagged, what happened']

export const LAYOUTS: { id: ArticleLayout; name: string; blurb: string }[] = [
  { id: 'standard', name: 'Standard', blurb: 'Headline, image, text, side rail' },
  { id: 'feature', name: 'Feature', blurb: 'Full-width image above the headline' },
  { id: 'data', name: 'Data story', blurb: 'Wide, no side rail, charts first' },
  { id: 'quick', name: 'Quick take', blurb: 'Short, one graphic, no hero' },
]

export const MLB_CODES = ['ARI', 'ATL', 'BAL', 'BOS', 'CHC', 'CHW', 'CIN', 'CLE', 'COL', 'DET', 'HOU', 'KC', 'LAA', 'LAD', 'MIA', 'MIL', 'MIN', 'NYM', 'NYY', 'OAK', 'PHI', 'PIT', 'SD', 'SEA', 'SF', 'STL', 'TB', 'TEX', 'TOR', 'WSH']

export function slugify(input: string): string {
  return input.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-')
}
