// src/lib/nfl/news.ts
//
// NFL NEWS — fetch + parse layer for the homepage news section.
//
// Confirmed live (Aug 2026) via curl against:
//   site.api.espn.com/apis/site/v2/sports/football/nfl/news?limit=N
//
// Unlike every other NFL endpoint in this pipeline, this one is fully
// inline — no $ref chasing, no N+1, no bulk name-lookup needed. It's
// the simplest fetcher in the NFL lib folder for exactly that reason.

// ─────────────────────────────────────────────────────────────────────
//  TYPES
// ─────────────────────────────────────────────────────────────────────

export type NFLNewsItem = {
  id: number
  headline: string
  description: string | null
  published: string      // ISO timestamp
  lastModified: string
  imageUrl: string | null
  articleUrl: string | null
  teamAbbrs: string[]    // teams tagged on this story, e.g. ['BUF']
  athleteNames: string[] // players tagged on this story
}

// ─────────────────────────────────────────────────────────────────────
//  RAW ESPN RESPONSE SHAPE (subset — only what we read, from the confirmed curl)
// ─────────────────────────────────────────────────────────────────────

type EspnNewsCategory = {
  type: string
  description?: string
  team?: { abbreviation?: string }
  athlete?: { description?: string }
}

type EspnNewsImage = {
  type?: string
  url: string
}

type EspnNewsArticle = {
  id: number
  headline: string
  description?: string
  published: string
  lastModified: string
  images?: EspnNewsImage[]
  categories?: EspnNewsCategory[]
  links?: { web?: { href?: string } }
}

type EspnNewsResponse = {
  articles?: EspnNewsArticle[]
}

// ─────────────────────────────────────────────────────────────────────
//  FETCH + PARSE
// ─────────────────────────────────────────────────────────────────────

/**
 * Fetches recent NFL news. Empty state beats fabricated data — returns
 * [] on any failure.
 */
export async function fetchNFLNews(limit: number = 20): Promise<NFLNewsItem[]> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?limit=${limit}`

  let json: EspnNewsResponse
  try {
    const res = await fetch(url, { next: { revalidate: 900 } } as RequestInit) // 15 min — news moves fast
    if (!res.ok) {
      console.error(`nfl-news: fetch failed — ${res.status}`)
      return []
    }
    json = await res.json()
  } catch (e) {
    console.error('nfl-news: fetch threw', e)
    return []
  }

  const articles = json.articles
  if (!articles || articles.length === 0) {
    console.error('nfl-news: no articles in response')
    return []
  }

  return articles.map(a => {
    const teamAbbrs: string[] = []
    const athleteNames: string[] = []
    for (const cat of a.categories ?? []) {
      if (cat.type === 'team' && cat.team?.abbreviation) teamAbbrs.push(cat.team.abbreviation)
      if (cat.type === 'athlete' && cat.athlete?.description) athleteNames.push(cat.athlete.description)
    }

    // Prefer a 'header'-type image if present, otherwise first available
    const headerImage = a.images?.find(img => img.type === 'header') ?? a.images?.[0]

    return {
      id: a.id,
      headline: a.headline,
      description: a.description ?? null,
      published: a.published,
      lastModified: a.lastModified,
      imageUrl: headerImage?.url ?? null,
      articleUrl: a.links?.web?.href ?? null,
      teamAbbrs,
      athleteNames,
    }
  })
}

/**
 * Filters news to stories tagged with a specific team — useful for team
 * pages, not just the league-wide homepage feed.
 */
export function filterNewsByTeam(news: NFLNewsItem[], teamAbbr: string): NFLNewsItem[] {
  return news.filter(item => item.teamAbbrs.includes(teamAbbr))
}
