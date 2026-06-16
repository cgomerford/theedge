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

  const url = `https://baseballsavant.mlb.com/statcast_search/csv?player_id=${playerId}&player_type=batter&season=${season}&type=batter&game_type=R&csv=true`

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TheEdge/1.0)', 'Accept': 'text/csv,*/*' },
      next: { revalidate: 3600 },
    })
    if (!res.ok) return NextResponse.json({ zones: [] })

    const text  = await res.text()
    const lines = text.trim().split('\n')
    if (lines.length < 2) return NextResponse.json({ zones: [] })

    const headers  = parseCSVLine(lines[0]).map(h => h.toLowerCase())
    const zoneIdx  = headers.indexOf('zone')
    const evtIdx   = headers.indexOf('events')
    const bbIdx    = headers.indexOf('bb_type')
    const xwobaIdx = headers.indexOf('estimated_woba_using_speedangle')

    console.log(`hot-zones: zone=${zoneIdx} evt=${evtIdx} bb=${bbIdx} xwoba=${xwobaIdx}`)

    if (zoneIdx === -1) return NextResponse.json({ zones: [] })

const map: Record<number, {
      pitches: number      // all pitches seen in this zone
      hits: number         // hits on balls in play in this zone
      bip: number          // balls in play in this zone
      xwobaSum: number
      xwobaCount: number
    }> = {}
    for (let z = 1; z <= 9; z++) map[z] = { pitches: 0, hits: 0, bip: 0, xwobaSum: 0, xwobaCount: 0 }

    for (let i = 1; i < lines.length; i++) {
      const cells = parseCSVLine(lines[i])
      const zone  = parseInt(cells[zoneIdx])
      if (isNaN(zone) || zone < 1 || zone > 9) continue

      // Every pitch in this zone counts
      map[zone].pitches++

      const bb_type = cells[bbIdx] ?? ''
      const isBIP   = bb_type && bb_type !== 'null'

      if (isBIP) {
        map[zone].bip++
        const events = cells[evtIdx] ?? ''
        if (['single','double','triple','home_run'].includes(events)) {
          map[zone].hits++
        }

        if (xwobaIdx >= 0) {
          const xw = parseFloat(cells[xwobaIdx])
          if (!isNaN(xw) && xw > 0) {
            map[zone].xwobaSum += xw
            map[zone].xwobaCount++
          }
        }
      }
    }

    const zones = Object.entries(map).map(([z, d]) => ({
      zone:   parseInt(z),
      ba:     d.bip >= 5 ? Math.round((d.hits / d.bip) * 1000) / 1000 : null,
      xwoba:  d.xwobaCount >= 5 ? Math.round((d.xwobaSum / d.xwobaCount) * 1000) / 1000 : null,
      pa:     d.pitches,   // show total pitches seen — more meaningful for zone chart
      bip:    d.bip,
    }))

    console.log(`hot-zones: zones with data: ${zones.filter(z => z.pa > 0).length}`)
    return NextResponse.json({ zones })
  } catch (err) {
    console.error('hot-zones failed:', err)
    return NextResponse.json({ zones: [] })
  }
}