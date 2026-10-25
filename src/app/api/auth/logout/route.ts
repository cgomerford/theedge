import { NextResponse } from 'next/server'
import { logout } from '@/lib/auth'
import { SITE_URL } from '@/lib/site'

export async function POST() {
  await logout()
  return NextResponse.redirect(new URL('/?logged-out=1', `${SITE_URL}`), { status: 303 })
}