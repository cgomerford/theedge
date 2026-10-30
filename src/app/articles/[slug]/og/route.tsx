// src/app/articles/[slug]/og/route.tsx
//
// The generated share card for an article, used when it has no usable hero image (see src/lib/seo/news.ts): cream background, the x9 mark top left, a small-caps section
// kicker, the headline in large black type, and the footer "Built on public game data. Independent, not affiliated with MLB." with @x9LabHQ in orange. No team logos, no
// player headshots. Sizes: 1200x675 (default, what X and Google News use), ?r=4x3 (1200x900) and ?r=1x1 (1200x1200) for structured data.
// It lives under /articles (not /api) so robots.txt never blocks it. Only published articles get a card.

import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { NextResponse } from 'next/server'
import { getArticleBySlug } from '@/lib/articles'
import { FOOTER_TEXT, HANDLE } from '@/lib/graphics/constants'
import { X9_MARK_DATA_URL } from '@/components/graphics/XMarkInline'
import { OG_SIZES, sectionLabel, type OgRatio } from '@/lib/seo/news'

const FONT_DIR = 'src/lib/postgame/cards/fonts'

/** Headline size by length, so a long headline still fits the card (taller cards allow a little more). */
export function headlineSize(len: number, tall: boolean): number {
  const base = len <= 50 ? 88 : len <= 80 ? 74 : len <= 110 ? 62 : len <= 150 ? 52 : 44
  return tall ? Math.round(base * 1.12) : base
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const article = await getArticleBySlug(slug)
  if (!article) return new NextResponse('Not found', { status: 404 })

  const r = new URL(req.url).searchParams.get('r')
  const ratio: OgRatio = r === '4x3' || r === '1x1' ? r : '16x9'
  const size = OG_SIZES[ratio]
  const tall = ratio !== '16x9'
  const [f800, f700] = await Promise.all([readFile(join(process.cwd(), FONT_DIR, 'RedHatDisplay-800.ttf')), readFile(join(process.cwd(), FONT_DIR, 'RedHatDisplay-700.ttf'))])
  const kicker = (article.section || sectionLabel(article)).toUpperCase()
  const title = article.title.length > 190 ? `${article.title.slice(0, 187)}…` : article.title

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#FAF8F3', color: '#1A1A1A', padding: '64px 72px', fontFamily: 'Red Hat Display' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={X9_MARK_DATA_URL} alt="" width={120} height={76} style={{ objectFit: 'contain' }} />
          <div style={{ display: 'flex', fontSize: 26, fontWeight: 800, letterSpacing: 5, color: '#B83A0E' }}>{kicker}</div>
        </div>
        <div style={{ display: 'flex', flex: 1, alignItems: 'center' }}>
          <div style={{ display: 'flex', fontSize: headlineSize(title.length, tall), fontWeight: 800, letterSpacing: -2, lineHeight: 1.05, color: '#1A1A1A' }}>{title}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '2px solid #D6D2C8', paddingTop: 22, fontSize: 24, fontWeight: 700, color: '#5C5A55' }}>
          <div style={{ display: 'flex' }}>{FOOTER_TEXT}</div>
          <div style={{ display: 'flex', color: '#FF5722', fontWeight: 800 }}>{HANDLE}</div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: 'Red Hat Display', data: f800, weight: 800, style: 'normal' }, { name: 'Red Hat Display', data: f700, weight: 700, style: 'normal' }],
      headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800' },
    },
  )
}
