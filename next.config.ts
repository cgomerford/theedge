import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // the X-graphic route reads its font files at request time; make sure the deploy bundles them
  outputFileTracingIncludes: { '/api/postgame-card/[gamePk]': ['./src/lib/postgame/cards/fonts/**/*'] },
  // Labs moved under /mlb/lab/ — permanent (308) so old bookmarks, emails and share-card
  // links keep working. `:path*` also matches the bare index and every tab segment.
  async redirects() {
    return [
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