// Development only: records the stored example data for the server-rendered lab tabs into src/data/lab-demo/server.json.
// Run once with `next dev`: GET /api/dev/lab-demo-snapshot. Does nothing in production.
import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { getContactLeaders, getContactProfile } from '@/lib/contact-profile/data'
import { getSwingMonthly, getTtoLeaders, getTtoProfile } from '@/lib/nerve-centre/data'
import { getPlatoonHitter, getPlatoonLeague } from '@/lib/platoon/data'
import { getSwingLabData } from '@/lib/swing-decisions/data'
import { getShapeLabData } from '@/lib/pitch-shape/data'
import { SAMPLE_BATTER, SAMPLE_PITCHER } from '@/lib/lab-sample'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET() {
  if (process.env.NODE_ENV !== 'development') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const id = SAMPLE_BATTER.id
  const contactProfile = await getContactProfile(id)
  const season = contactProfile?.season ?? new Date().getFullYear()
  const out: Record<string, unknown> = {
    contactProfile, contactLeaders: await getContactLeaders(),
    swingMonthly: await getSwingMonthly(id, season),
    ttoProfile: await getTtoProfile(id, season), ttoLeaders: await getTtoLeaders(season),
    platoonHitter: await getPlatoonHitter(id), platoonLeague: await getPlatoonLeague(),
    swingLab: await getSwingLabData(id),
    shape: await getShapeLabData(SAMPLE_PITCHER.id),
  }
  const file = path.join(process.cwd(), 'src/data/lab-demo/server.json')
  await fs.writeFile(file, JSON.stringify(out))
  return NextResponse.json({ ok: true, keys: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v == null ? 'null' : JSON.stringify(v).length])) })
}
