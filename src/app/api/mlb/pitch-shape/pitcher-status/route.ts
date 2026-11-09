// src/app/api/mlb/pitch-shape/pitcher-status/route.ts
//
// The career-path facts for every pitcher in a minor-league cohort (level, pitch type and hand, 100+ pitches that season; 30+ at Spring Training and the Arizona Fall League): age, MLB debut, MLB pitches and results this season, trades,
// options and organisation. They drive the finder's "Refine" choices: who has not made the jump, who was sent down, who was traded, who struggled in MLB. Same access rule as the other
// shape routes: four-seam and sweeper are free, every other pitch type is Pro and refused here, server-side. Reads pitch_shape_pitcher_milb, the MLB results tables and the MLB Stats API.
//   ?level=aaa|fsl&type=FF&hand=R[&season=2026]

import { NextRequest, NextResponse } from 'next/server'
import { isProViewer } from '@/lib/require-pro'
import { FREE_SANDBOX_TYPES, PITCH_NAMES } from '@/lib/pitch-shape/model'
import { isMilb, parseLevel } from '@/lib/milb-shape/levels'
import { resolveSeason } from '@/lib/milb-shape/server'
import { milbDb } from '@/lib/milb-shape/dev-db'
import { getPitcherStatuses } from '@/lib/milb-shape/status-server'
import { limitsFor } from '@/lib/milb-shape/limits'

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams
  const level = parseLevel(sp.get('level')), type = sp.get('type') ?? '', hand = sp.get('hand')
  if (!isMilb(level) || !(type in PITCH_NAMES) || (hand !== 'R' && hand !== 'L')) return NextResponse.json({ error: 'Bad level, type or hand' }, { status: 400 })
  if (!(FREE_SANDBOX_TYPES as readonly string[]).includes(type) && !(await isProViewer())) return NextResponse.json({ error: 'Pro required', upgrade: '/pricing' }, { status: 403 })
  const season = await resolveSeason(level, sp.get('season'))
  const { data, error } = await (await milbDb()).from('pitch_shape_pitcher_milb').select('pitcher_id').eq('level', level).eq('season', season).eq('pitch_type', type).eq('p_throws', hand).gte('n_pitches', limitsFor(level).gated ? 100 : limitsFor(level).comparePitches).limit(1000)   // the exhibition levels list a pitcher from 30 pitches, so their cohort is the same one the map shows
  if (error) return NextResponse.json({ statuses: [], leagueRuns100: null, season })
  const ids = ((data ?? []) as unknown as { pitcher_id: number }[]).map(r => r.pitcher_id)
  const out = await getPitcherStatuses(ids, new Date().getFullYear())
  return NextResponse.json({ ...out, season, asOf: new Date().toISOString().slice(0, 10), requested: ids.length })
}
