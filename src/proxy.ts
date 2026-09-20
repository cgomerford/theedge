// src/proxy.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const MAINTENANCE_MODE = false;
const BYPASS_COOKIE = 'edge_preview_access';

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

  // --- Maintenance takeover (everything else, except home/maintenance/auth) ---
  if (!MAINTENANCE_MODE) return NextResponse.next();

  if (
    pathname === '/' ||
    pathname === '/maintenance' ||
    pathname.startsWith('/api/maintenance-auth')
  ) {
    return NextResponse.next();
  }

  // Password bypass only works in dev — never honored in production
  if ((process.env.NODE_ENV as string) !== 'production') {
    const bypass = request.cookies.get(BYPASS_COOKIE)?.value;
    if (bypass && bypass === process.env.MAINTENANCE_PASSWORD) {
      return NextResponse.next();
    }
  }

  const url = new URL('/maintenance', request.url);
  url.searchParams.set('from', pathname);
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)',
  ],
};