import * as cheerio from 'cheerio'
import { NextResponse } from 'next/server'

export const revalidate = 21600 // 6 hours

function nameFromSlug(href: string): string {
  const slug = href.split('/').pop() || ''
  return slug
    .replace(/-\d+$/, '')
    .split('-')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export async function GET() {
  try {
    const res = await fetch('https://www.mlb.com/milb/prospects/top100', {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'text/html',
      },
      next: { revalidate: 21600 },
    })

    if (!res.ok) {
      return NextResponse.json({ count: 0, prospects: [] })
    }

    const html = await res.text()
    const $ = cheerio.load(html)

    const prospects: any[] = []

    $('table tr').each((_, row) => {
      const cells = $(row).find('td')
      if (cells.length < 4) return

      const rank = parseInt($(cells[0]).text().trim(), 10)
      if (!rank || isNaN(rank) || rank > 100) return

      const playerCell = $(cells[1])
      const link = playerCell.find('a').first()
      const href = link.attr('href') || ''

      let name = (link.text() || playerCell.text()).trim()
      if (!name && href) {
        name = nameFromSlug(href)
      }

      const idMatch = href.match(/-(\d{5,})$/) || href.match(/(\d{6,})/)
      const playerId = idMatch ? Number(idMatch[1]) : null

      prospects.push({
        rank,
        player_name: name,
        position: $(cells[2]).text().trim(),
        team_name: $(cells[3]).text().trim(),
        level: $(cells[4])?.text().trim() || '',
        eta: $(cells[5])?.text().trim() || undefined,
        age: $(cells[6])?.text().trim() || undefined,
        playerId,
      })
    })

    const unique = Array.from(new Map(prospects.map(p => [p.rank, p])).values())
      .filter(p => p.rank >= 1 && p.rank <= 100)
      .sort((a, b) => a.rank - b.rank)

    return NextResponse.json({
      updated: new Date().toISOString(),
      count: unique.length,
      prospects: unique,
    })
  } catch (err) {
    console.error('Prospects scrape error:', err)
    return NextResponse.json({ count: 0, prospects: [] })
  }
}