// Direct fetch from Savant's pitch-arsenal-stats CSV — confirmed working
// 2026-07-13, returns run_value, whiff%, woba, est_woba, hard_hit%,
// put_away, usage, all per pitch type per pitcher. Replaces the Python
// cron → Supabase pipeline which had accuracy issues per user feedback.
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function parseCSVLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') inQuotes = !inQuotes
    else if (ch === ',' && !inQuotes) { cells.push(current.trim()); current = '' }
    else current += ch
  }
  cells.push(current.trim())
  return cells
}

export type ArsenalRow = {
  pitchType: string
  pitchName: string
  pitches: number
  usage: number
  whiffPct: number | null
  kPct: number | null
  putAway: number | null
  ba: number | null
  slg: number | null
  woba: number | null
  estBa: number | null
  estSlg: number | null
  estWoba: number | null
  hardHitPct: number | null
  runValue: number | null
  runValuePer100: number | null
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const pitcherId = Number(searchParams.get('pitcherId'))
  const season = Number(searchParams.get('season') ?? new Date().getFullYear())
  if (!pitcherId) return NextResponse.json({ error: 'pitcherId required' }, { status: 400 })

  const url = `https://baseballsavant.mlb.com/leaderboard/pitch-arsenal-stats?type=pitcher&pitchType=&year=${season}&min=1&csv=true`

  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/csv,*/*',
      },
    })
    if (!res.ok) return NextResponse.json({ error: `Savant returned ${res.status}` }, { status: 502 })

    const text = await res.text()
    const lines = text.trim().split('\n')
    if (lines.length < 2) return NextResponse.json({ rows: [] })

    const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase().replace(/"/g, ''))
    const idx = (key: string) => headers.indexOf(key)
    const numAt = (cells: string[], key: string): number | null => {
      const i = idx(key)
      if (i === -1) return null
      const v = parseFloat(cells[i])
      return isNaN(v) ? null : v
    }

    const rows: ArsenalRow[] = []
    for (let i = 1; i < lines.length; i++) {
      const cells = parseCSVLine(lines[i]).map(c => c.replace(/"/g, ''))
      const id = Number(cells[idx('player_id')])
      if (id !== pitcherId) continue
      rows.push({
        pitchType: cells[idx('pitch_type')] ?? '',
        pitchName: cells[idx('pitch_name')] ?? cells[idx('pitch_type')] ?? '—',
        pitches: numAt(cells, 'pitches') ?? 0,
        usage: numAt(cells, 'pitch_usage') ?? 0,
        whiffPct: numAt(cells, 'whiff_percent'),
        kPct: numAt(cells, 'k_percent'),
        putAway: numAt(cells, 'put_away'),
        ba: numAt(cells, 'ba'),
        slg: numAt(cells, 'slg'),
        woba: numAt(cells, 'woba'),
        estBa: numAt(cells, 'est_ba'),
        estSlg: numAt(cells, 'est_slg'),
        estWoba: numAt(cells, 'est_woba'),
        hardHitPct: numAt(cells, 'hard_hit_percent'),
        runValue: numAt(cells, 'run_value'),
        runValuePer100: numAt(cells, 'run_value_per_100'),
      })
    }
    rows.sort((a, b) => b.usage - a.usage)
    return NextResponse.json({ rows })
  } catch (err) {
    console.error('[pitcher-arsenal] fetch failed:', err)
    return NextResponse.json({ error: 'Failed to fetch arsenal data' }, { status: 500 })
  }
}