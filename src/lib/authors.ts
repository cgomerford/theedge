// src/lib/authors.ts
//
// Authors for article bylines and /authors/[slug]. Articles store the author's name; the slug is derived from it, so every name gets a page. A person listed here gets a
// real bio; anyone else gets the plain default. Add a person by adding an entry.

export interface Author { name: string; slug: string; role: string; bio: string; xUrl?: string }

export const authorSlug = (name: string) =>
  name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x9lab'

const KNOWN: Author[] = [
  {
    name: 'George', slug: 'george', role: 'Founder and writer',
    bio: 'George built x9Lab. He is a baseball fan from the UK with a data science background, and he writes about what the public pitch and batted-ball data shows, with the sample behind every number.',
    xUrl: 'https://x.com/x9LabHQ',
  },
]

/** The author for a name as stored on an article (a plain default for names not listed). */
export function authorFor(name: string | null | undefined): Author {
  const n = (name ?? '').trim() || 'x9Lab'
  const slug = authorSlug(n)
  return KNOWN.find(a => a.slug === slug) ?? { name: n, slug, role: 'Writer', bio: `${n} writes for x9Lab: analysis built on public game data, with the sample behind every number.` }
}
export const getAuthorBySlug = (slug: string): Author | null => KNOWN.find(a => a.slug === slug) ?? null
