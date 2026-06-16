import { NextResponse } from 'next/server'

export const dynamic    = 'force-dynamic'
export const revalidate = 0

function parseCSVLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      cells.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  cells.push(current.trim())
  return cells
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const playerId = searchParams.get('playerId')
  const season   = searchParams.get('season') ?? new Date().getFullYear().toString()

  if (!playerId) return NextResponse.json({ error: 'playerId required' }, { status: 400 })

  const url = [
    'https://baseballsavant.mlb.com/statcast_search/csv',
    `?player_id=${playerId}&player_type=batter&season=${season}&type=batter&game_type=R&csv=true`,
  ].join('')

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TheEdge/1.0)', 'Accept': 'text/csv,*/*' },
      next: { revalidate: 3600 },
    })
    if (!res.ok) return NextResponse.json({ balls: [] })

    const text  = await res.text()
    const lines = text.trim().split('\n')
    if (lines.length < 2) return NextResponse.json({ balls: [] })

    const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase())
    const hcxIdx  = headers.indexOf('hc_x')
    const hcyIdx  = headers.indexOf('hc_y')
    const evtIdx  = headers.indexOf('events')
    const bbIdx   = headers.indexOf('bb_type')

    console.log(`spray-chart: hcx=${hcxIdx} hcy=${hcyIdx} evt=${evtIdx} bb=${bbIdx}`)

    if (hcxIdx === -1 || hcyIdx === -1) return NextResponse.json({ balls: [] })

    const balls: { x: number; y: number; events: string; bb_type: string }[] = []

    for (let i = 1; i < lines.length; i++) {
      const cells   = parseCSVLine(lines[i])
      const bb_type = cells[bbIdx] ?? ''
      if (!bb_type || bb_type === 'null') continue
      const hc_x = parseFloat(cells[hcxIdx])
      const hc_y = parseFloat(cells[hcyIdx])
      if (isNaN(hc_x) || isNaN(hc_y) || hc_x === 0) continue
      balls.push({ x: hc_x, y: hc_y, events: cells[evtIdx] ?? '', bb_type })
    }

    console.log(`spray-chart: ${balls.length} balls parsed for player ${playerId}`)
    return NextResponse.json({ balls })
  } catch (err) {
    console.error('spray-chart failed:', err)
    return NextResponse.json({ balls: [] })
  }
}