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

  // Get current primary_team to validate it's still in the new selection
  const { data: existing } = await supa
    .from('subscribers')
    .select('primary_team')
    .eq('preferences_token', token)
    .single()

  // If their previous primary team is no longer in their selection, clear it
  // (or default to first team in new selection if they had no primary before)
  let newPrimaryTeam: string | null = existing?.primary_team ?? null
  if (newPrimaryTeam && !teams.includes(newPrimaryTeam)) {
    newPrimaryTeam = teams[0] ?? null
  } else if (!newPrimaryTeam && teams.length > 0) {
    newPrimaryTeam = teams[0]
  } else if (teams.length === 0) {
    newPrimaryTeam = null
  }

  const { error } = await supa
    .from('subscribers')
    .update({ teams, primary_team: newPrimaryTeam })
    .eq('preferences_token', token)

  if (error) {
    console.error('Preferences save error:', error)
    return NextResponse.redirect(new URL('/?error=server', req.url), { status: 303 })
  }

  return NextResponse.redirect(new URL(`/preferences/${token}?saved=1`, req.url), { status: 303 })
}