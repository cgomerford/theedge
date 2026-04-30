import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { preferencesLimit, getClientIp } from '@/lib/ratelimit'

export async function POST(req: NextRequest) {
  // Rate limit
  const ip = getClientIp(req)
  const { success } = await preferencesLimit.limit(ip)
  if (!success) {
    return NextResponse.redirect(new URL('/?error=rate-limit', req.url), { status: 303 })
  }

  const formData = await req.formData()
  const token = formData.get('token') as string
  const teams = formData.getAll('teams') as string[]

  if (!token) {
    return NextResponse.redirect(new URL('/?error=invalid-token', req.url), { status: 303 })
  }

  const supa = createAdminClient()
  const { error } = await supa
    .from('subscribers')
    .update({ teams })
    .eq('preferences_token', token)

  if (error) {
    console.error('Preferences save error:', error)
    return NextResponse.redirect(new URL('/?error=server', req.url), { status: 303 })
  }

  return NextResponse.redirect(new URL(`/preferences/${token}?saved=1`, req.url), { status: 303 })
}