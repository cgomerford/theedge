import { NextRequest, NextResponse } from 'next/server'
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

  return NextResponse.redirect(new URL('/dugout', req.url), { status: 303 })
}