import { NextRequest, NextResponse } from 'next/server'
import { getCurrentSubscriber } from '@/lib/auth'
import {
  gradeRoster,
  parseRosterText,
  type LeaguePlatform,
  type RosterEntryIn,
} from '@/lib/fantasy-league'

export const dynamic = 'force-dynamic'

const PLATFORMS = new Set<LeaguePlatform>(['ESPN', 'Yahoo', 'Sleeper', 'CBS', 'DraftKings'])

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const raw = body as {
    entries?: RosterEntryIn[]
    text?: string
    platform?: string
  }

  const platform = PLATFORMS.has(raw.platform as LeaguePlatform)
    ? (raw.platform as LeaguePlatform)
    : 'ESPN'

  let entries: RosterEntryIn[] = Array.isArray(raw.entries) ? raw.entries : []
  if (entries.length === 0 && typeof raw.text === 'string') {
    entries = parseRosterText(raw.text)
  }
  entries = entries
    .filter(e => e && typeof e.name === 'string' && e.name.trim().length >= 2)
    .slice(0, 40)
    .map(e => ({
      name: String(e.name).slice(0, 80),
      mlbId: typeof e.mlbId === 'number' && Number.isFinite(e.mlbId) ? e.mlbId : null,
      slot: typeof e.slot === 'string' ? e.slot.slice(0, 8) : null,
    }))

  if (entries.length === 0) {
    return NextResponse.json({ error: 'Add at least one player.' }, { status: 400 })
  }

  const subscriber = await getCurrentSubscriber()
  const isPro = subscriber?.is_pro === true || subscriber?.role === 'admin'

  try {
    const result = await gradeRoster({ entries, platform, includeRos: isPro })
    return NextResponse.json({ ...result, isPro })
  } catch (err) {
    console.error('[fantasy-league] grade failed', err)
    return NextResponse.json({ error: 'Grade failed. Try a smaller roster.' }, { status: 500 })
  }
}
