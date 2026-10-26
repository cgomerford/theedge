// src/proxy.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isMaintenanceGated } from '@/lib/maintenance-gates';
import { LOOK_COOKIE, LOOK_MAX_AGE, signLook, verifyLook } from '@/lib/deep-look-cookie';

const MAINTENANCE_MODE = false;
const BYPASS_COOKIE = 'edge_preview_access';

// Password bypass only works in dev — never honored in production
function hasPreviewBypass(request: NextRequest): boolean {
  if ((process.env.NODE_ENV as string) === 'production') return false;
  const bypass = request.cookies.get(BYPASS_COOKIE)?.value;
  return !!bypass && bypass === process.env.MAINTENANCE_PASSWORD;
}

function maintenanceRewrite(request: NextRequest, pathname: string) {
  const url = new URL('/maintenance', request.url);
  url.searchParams.set('from', pathname);
  const response = NextResponse.rewrite(url);
  // A held-back page must never get indexed as a copy of the maintenance screen.
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
}

// ── Free deep look: the first gated module a signed-in account opens each day is "theirs" for that day ──
// Only real page loads count (Next.js link prefetches are skipped), and only for browsers that carry a session cookie.
const GATED_LAB = {
  batting: 'arsenal|hot-zones|location|sequencing|trends|h2h|reaction',
  pitching: 'arsenal|h2h|location|overlay|sequencing|shape|stuff|trends',
}
function moduleFor(pathname: string): { feature: string; key: string } | null {
  let m = /^\/mlb\/players\/(\d+)\/?$/.exec(pathname)
  if (m) return { feature: 'player_zones', key: m[1] }
  m = new RegExp(`^/mlb/lab/(batting|pitching)-lab/(\\d+)/(?:${GATED_LAB.batting}|${GATED_LAB.pitching})/?$`).exec(pathname)
  if (m) {
    const allowed = new RegExp(`/(?:${GATED_LAB[m[1] as 'batting' | 'pitching']})/?$`)
    return allowed.test(pathname) ? { feature: `${m[1]}_lab`, key: m[2] } : null
  }
  m = /^\/mlb\/teams\/([a-z0-9-]+)\/?$/.exec(pathname)
  if (m) return { feature: 'team_arsenal', key: m[1] }
  m = /^\/mlb\/([a-z0-9-]+-vs-[a-z0-9-]+-\d{4}-\d{2}-\d{2}(?:-game\d+)?)\/?$/.exec(pathname)
  if (m) return { feature: 'preview_zones', key: m[1] }
  return null
}

async function claimDeepLook(request: NextRequest, pathname: string) {
  const mod = moduleFor(pathname)
  const isPrefetch = !!request.headers.get('next-router-prefetch') || request.headers.get('purpose') === 'prefetch' || request.headers.get('sec-purpose')?.includes('prefetch')
  if (!mod || isPrefetch || request.method !== 'GET' || !request.cookies.get('edge_session')?.value) return NextResponse.next()
  if (await verifyLook(request.cookies.get(LOOK_COOKIE)?.value)) return NextResponse.next() // already claimed today
  const value = await signLook(mod.feature, mod.key)
  // Make the new cookie visible to this very request (the page reads it), and send it to the browser.
  const headers = new Headers(request.headers)
  const rest = (headers.get('cookie') ?? '').split(';').map(c => c.trim()).filter(c => c && !c.startsWith(`${LOOK_COOKIE}=`))
  headers.set('cookie', [...rest, `${LOOK_COOKIE}=${value}`].join('; '))
  const res = NextResponse.next({ request: { headers } })
  res.cookies.set(LOOK_COOKIE, value, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: LOOK_MAX_AGE, secure: process.env.NODE_ENV === 'production' })
  return res
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // --- Admin basic-auth guard (dev-only per George; scoped to /admin only) ---
  if (pathname.startsWith('/admin')) {
    const user = process.env.ADMIN_USER;
    const pass = process.env.ADMIN_PASSWORD;

    if (!user || !pass) {
      return new NextResponse(
        'Admin auth is not configured (set ADMIN_USER / ADMIN_PASSWORD).',
        { status: 500 }
      );
    }

    const header = request.headers.get('authorization');
    if (header) {
      const [scheme, encoded] = header.split(' ');
      if (scheme === 'Basic' && encoded) {
        const [u, p] = atob(encoded).split(':');
        if (u === user && p === pass) {
          return NextResponse.next();
        }
      }
    }

    return new NextResponse('Authentication required.', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="x9Lab Admin", charset="UTF-8"' },
    });
  }

  // --- Section gates: specific sections held behind the maintenance page ---
  // (list lives in lib/maintenance-gates.ts; the rest of the site stays live)
  if (!MAINTENANCE_MODE) {
    if (!isMaintenanceGated(pathname)) return claimDeepLook(request, pathname);
    if (hasPreviewBypass(request)) return NextResponse.next();
    return maintenanceRewrite(request, pathname);
  }

  // --- Maintenance takeover (everything else, except home/maintenance/auth) ---

  if (
    pathname === '/' ||
    pathname === '/maintenance' ||
    pathname.startsWith('/api/maintenance-auth')
  ) {
    return NextResponse.next();
  }

  if (hasPreviewBypass(request)) return NextResponse.next();

  return maintenanceRewrite(request, pathname);
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)',
  ],
};