/**
 * JSON-LD structured data helpers. Server components: the markup is in the HTML.
 *
 *   <SiteSchema />                  Organization + WebSite   (root layout)
 *   <BreadcrumbSchema items />      BreadcrumbList           (every public page)
 *   <PersonSchema />                player pages (no image)
 *   <SportsTeamSchema />            team pages
 *   <SportsEventSchema />           game, scout-report and postgame pages
 *   <FAQSchema />                   /faq
 *
 * No Product or Offer schema, and no logo image.
 */

import { buildOrganizationJsonLd } from '@/lib/seo/news'
import { SITE_NAME, SITE_URL } from '@/lib/site'

function JsonLd({ data }: { data: Record<string, unknown> }) {
  // "<" is escaped so a stray "</script>" in a name can never close the tag.
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  )
}

export function SiteSchema() {
  return (
    <>
      <JsonLd data={buildOrganizationJsonLd()} />
      <JsonLd data={{ '@context': 'https://schema.org', '@type': 'WebSite', name: SITE_NAME, url: SITE_URL }} />
    </>
  )
}

export function BreadcrumbSchema({ items }: { items: { name: string; path: string }[] }) {
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: items.map((it, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: it.name,
          item: SITE_URL + it.path,
        })),
      }}
    />
  )
}

export function PersonSchema({ name, path, teamName }: { name: string; path: string; teamName?: string | null }) {
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'Person',
        name,
        url: SITE_URL + path,
        jobTitle: 'Baseball player',
        ...(teamName ? { affiliation: { '@type': 'SportsTeam', name: teamName } } : {}),
      }}
    />
  )
}

export function SportsTeamSchema({ name, path }: { name: string; path: string }) {
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'SportsTeam',
        name,
        sport: 'Baseball',
        url: SITE_URL + path,
        memberOf: { '@type': 'SportsOrganization', name: 'Major League Baseball' },
      }}
    />
  )
}

export function SportsEventSchema({
  homeTeam,
  awayTeam,
  gameDate,
  venue,
  path,
}: {
  homeTeam: string
  awayTeam: string
  gameDate?: string | null // ISO
  venue?: string | null
  path: string
}) {
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'SportsEvent',
        name: `${awayTeam} at ${homeTeam}`,
        sport: 'Baseball',
        url: SITE_URL + path,
        ...(gameDate ? { startDate: gameDate } : {}),
        ...(venue ? { location: { '@type': 'StadiumOrArena', name: venue } } : {}),
        homeTeam: { '@type': 'SportsTeam', name: homeTeam },
        awayTeam: { '@type': 'SportsTeam', name: awayTeam },
      }}
    />
  )
}

export function FAQSchema({ items }: { items: { question: string; answer: string }[] }) {
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: items.map(it => ({
          '@type': 'Question',
          name: it.question,
          acceptedAnswer: { '@type': 'Answer', text: it.answer },
        })),
      }}
    />
  )
}
