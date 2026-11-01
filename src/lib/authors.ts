// src/lib/authors.ts
//
// Authors for article bylines and /authors/[slug]. Articles store the author's name; the slug is derived from it, so every name gets a page. A person listed here gets a
// real bio; anyone else gets the plain default. Add a person by adding an entry.

export interface Author {
  name: string; slug: string; role: string
  /** one third-person sentence or two: the meta description and the structured data */
  bio: string
  /** the author's own words, first person, shown on their page (falls back to bio) */
  intro?: string[]
  xUrl?: string
}

export const authorSlug = (name: string) =>
  name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x9lab'

const KNOWN: Author[] = [
  {
    name: 'George', slug: 'george', role: 'Founder and writer',
    bio: 'George built x9Lab. He is a baseball fan from the UK with a data science background, and he writes about what the public pitch and batted-ball data shows, with the sample behind every number.',
    intro: [
      "I'm George. I built x9Lab. I'm a baseball fan from the UK, and I love the sport for its statistics as much as for the games.",
      'It started at a Phillies game. The scoreboard was full of numbers I had never seen on a screen at a ballpark: pitch speeds, spin, how a hitter does against each pitch. It made me want to understand all of it, so I went looking for where those numbers came from and found Baseball Savant. The data was all there, but I found it hard to use.',
      'So I built the thing I was looking for: the same public data, laid out so a fan can read it, with the depth still there for anyone who wants to keep digging. I work with data for a living, and I wanted to use that to build the kind of tools a front office might use, and put them in front of fans.',
      "Here I write about what the public pitch and batted-ball data shows, with the sample behind every number. I describe what has happened and how often. I don't claim to know what happens next.",
    ],
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
