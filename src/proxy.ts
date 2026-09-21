// src/proxy.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isMaintenanceGated } from '@/lib/maintenance-gates';

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

export function proxy(request: NextRequest) {
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
      headers: { 'WWW-Authenticate': 'Basic realm="The Edge Admin", charset="UTF-8"' },
    });
  }

  // --- Section gates: specific sections held behind the maintenance page ---
  // (list lives in lib/maintenance-gates.ts; the rest of the site stays live)
  if (!MAINTENANCE_MODE) {
    if (!isMaintenanceGated(pathname)) return NextResponse.next();
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