import type { NextConfig } from 'next'
import { MLB_TEAMS } from './src/lib/teams'
import { SITE_HOST, SITE_URL } from './src/lib/site'

// Long team slugs (/mlb/teams/new-york-yankees) redirect to the short slugs the routes use (/mlb/teams/yankees).
const longTeamSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const teamSlugRedirects = MLB_TEAMS.filter(t => longTeamSlug(t.name) !== t.slug).map(t => ({
  source: `/mlb/teams/${longTeamSlug(t.name)}`,
  destination: `/mlb/teams/${t.slug}`,
  permanent: true,
}))

const nextConfig: NextConfig = {
  // the X-graphic route reads its font files at request time; make sure the deploy bundles them
  outputFileTracingIncludes: { '/api/postgame-card/[gamePk]': ['./src/lib/postgame/cards/fonts/**/*'] },
  // Labs moved under /mlb/lab/ — permanent (308) so old bookmarks, emails and share-card
  // links keep working. `:path*` also matches the bare index and every tab segment.
  async redirects() {
    return [
      // www -> apex, same path
      { source: '/:path*', has: [{ type: 'host' as const, value: `www.${SITE_HOST}` }], destination: `${SITE_URL}/:path*`, permanent: true },
      // old "-at-" game slugs -> "-vs-" (also covers /postgame, /scout-report, etc.)
      { source: '/mlb/:away([^/]+?)-at-:home([^/]+)', destination: '/mlb/:away-vs-:home', permanent: true },
      { source: '/mlb/:away([^/]+?)-at-:home([^/]+)/:rest*', destination: '/mlb/:away-vs-:home/:rest*', permanent: true },
      ...teamSlugRedirects,
      { source: '/stats', destination: '/mlb/stats', permanent: true },
      { source: '/stats/player/:id', destination: '/mlb/players/:id', permanent: true },
      { source: '/stats/player', has: [{ type: 'query' as const, key: 'id', value: '(?<id>[0-9]+)' }], destination: '/mlb/players/:id', permanent: true },
      { source: '/tonight', destination: '/mlb', permanent: true },
      { source: '/track-record', destination: '/mlb/scores', permanent: true },
      { source: '/dugout', destination: '/lab', permanent: true },
      { source: '/pro', destination: '/pricing', permanent: true },
      { source: '/mlb/pitching-lab/:path*', destination: '/mlb/lab/pitching-lab/:path*', permanent: true },
      { source: '/mlb/batting-lab/:path*', destination: '/mlb/lab/batting-lab/:path*', permanent: true },
    ]
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      {
        // Don't index personal preference URLs
        source: '/preferences/:token*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ]
  },
}

export default nextConfig