import { NextResponse } from 'next/server'
import { logout } from '@/lib/auth'

export async function POST() {
  await logout()
  return NextResponse.redirect(new URL('/?logged-out=1', 'https://edgereportdaily.com'), { status: 303 })
}