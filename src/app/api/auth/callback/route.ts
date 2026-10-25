import { NextRequest, NextResponse } from 'next/server'
import { safeReturnPath } from '@/lib/attribution'
import { consumeLoginLink, createSession } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')

  if (!token) {
    return NextResponse.redirect(new URL('/login?error=missing', req.url), { status: 303 })
  }

  const subscriber = await consumeLoginLink(token)

  if (!subscriber) {
    return NextResponse.redirect(new URL('/login?error=invalid-or-expired', req.url), { status: 303 })
  }

  await createSession(subscriber.id)

  // ?next= (same-site paths only), then the page they signed up from, then their dashboard.
  const next = safeReturnPath(req.nextUrl.searchParams.get('next')) ?? safeReturnPath(subscriber.return_to) ?? '/me'
  return NextResponse.redirect(new URL(next, req.url), { status: 303 })
}