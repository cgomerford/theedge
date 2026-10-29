// src/lib/maintenance-gates.ts
//
// Sections held behind the maintenance page until they're ready to launch.
// Single source of truth: proxy.ts rewrites these paths to /maintenance and
// sitemap.ts leaves them out, so a gated URL is neither reachable nor advertised.
//
// To launch a section: delete its prefix from this list. Nothing else to touch.
//
// Matching is on whole path segments, so '/nhl' covers '/nhl' and '/nhl/anything'
// but not a hypothetical '/nhlx'. API routes are outside the proxy matcher and are
// NOT gated by this list.

export const MAINTENANCE_GATED_PREFIXES: readonly string[] = [
  '/nhl',
  '/preview/nhl',
]

export function isMaintenanceGated(pathname: string): boolean {
  return MAINTENANCE_GATED_PREFIXES.some(p => pathname === p || pathname.startsWith(`${p}/`))
}
