// src/lib/maintenance-gates.ts
//
// Sections held behind the maintenance page until they're ready to launch.
// Single source of truth: proxy.ts rewrites these paths to /maintenance and
// sitemap.ts leaves them out, so a gated URL is neither reachable nor advertised.
//
// To launch a section: delete its prefix from this list. Nothing else to touch.
//
// Matching is on whole path segments, so '/nfl' covers '/nfl' and '/nfl/anything'
// but not a hypothetical '/nflx'. API routes are outside the proxy matcher and are
// NOT gated by this list.

export const MAINTENANCE_GATED_PREFIXES: readonly string[] = [
  '/fantasy',
  '/nfl',
  '/preview/nfl',
]

export function isMaintenanceGated(pathname: string): boolean {
  return MAINTENANCE_GATED_PREFIXES.some(p => pathname === p || pathname.startsWith(`${p}/`))
}
