/**
 * src/components/StructuredData.tsx
 *
 * JSON-LD structured data helper. Drop into pages to give Google rich
 * snippets and better understanding of the page content.
 *
 * Three schema types provided:
 *   - WebSite (for homepage)
 *   - SportsEvent (for game preview pages)
 *   - Article (for fantasy desk + news content)
 *
 * Usage:
 *   import { WebSiteSchema, SportsEventSchema, ArticleSchema } from '@/components/StructuredData'
 *
 *   // In a page:
 *   <WebSiteSchema />
 *   <SportsEventSchema
 *     homeTeam="Philadelphia Phillies"
 *     awayTeam="San Diego Padres"
 *     gameDate="2026-06-03T22:40:00Z"
 *     venue="Citizens Bank Park"
 *   />
 */

const SITE_URL = 'https://edgereportdaily.com'

// ─── WebSite schema (homepage) ────────────────────────────────────────────────
export function WebSiteSchema() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'The Edge',
    alternateName: 'The Edge Daily',
    url: SITE_URL,
    description: 'Pre-game intelligence briefs for MLB fans and fantasy players. Daily Edge Scores, streamer picks, and matchup analysis.',
    publisher: {
      '@type': 'Organization',
      name: 'The Edge',
      url: SITE_URL,
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_URL}/logo.png`,
      },
    },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}

// ─── SportsEvent schema (game preview pages) ──────────────────────────────────
export function SportsEventSchema({
  homeTeam,
  awayTeam,
  gameDate,
  venue,
  url,
}: {
  homeTeam: string
  awayTeam: string
  gameDate: string  // ISO format
  venue: string
  url: string
}) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: `${awayTeam} at ${homeTeam}`,
    description: `MLB matchup preview: ${awayTeam} at ${homeTeam}. Edge Score, starting pitcher analysis, and matchup tilt breakdown.`,
    startDate: gameDate,
    sport: 'Baseball',
    url: url,
    location: {
      '@type': 'StadiumOrArena',
      name: venue,
    },
    competitor: [
      {
        '@type': 'SportsTeam',
        name: homeTeam,
      },
      {
        '@type': 'SportsTeam',
        name: awayTeam,
      },
    ],
    organizer: {
      '@type': 'SportsOrganization',
      name: 'Major League Baseball',
    },
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}

// ─── Article schema (fantasy + news content) ─────────────────────────────────
export function ArticleSchema({
  headline,
  description,
  datePublished,
  dateModified,
  url,
  imageUrl,
}: {
  headline: string
  description: string
  datePublished: string
  dateModified?: string
  url: string
  imageUrl?: string
}) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline,
    description,
    datePublished,
    dateModified: dateModified ?? datePublished,
    url,
    image: imageUrl ?? `${SITE_URL}/og-image.png`,
    author: {
      '@type': 'Organization',
      name: 'The Edge',
      url: SITE_URL,
    },
    publisher: {
      '@type': 'Organization',
      name: 'The Edge',
      url: SITE_URL,
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_URL}/logo.png`,
      },
    },
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}
