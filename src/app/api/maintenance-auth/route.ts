import { NextResponse } from 'next/server';

export async function POST(request: Request) {
   if ((process.env.NODE_ENV as string) === 'production') {
    return NextResponse.json({ error: 'Not available' }, { status: 404 });
  }

  const { password } = await request.json();

  if (!process.env.MAINTENANCE_PASSWORD) {
    return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  }

  if (password !== process.env.MAINTENANCE_PASSWORD) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set('edge_preview_access', password, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 14, // 14 days — comfortably covers the week+ of QA
    path: '/',
  });
  return response;
}