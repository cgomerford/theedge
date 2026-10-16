'use client'

import { SANS } from '@/components/team/ui'
import { BODY_TOP, ROW, SAFE_W, SPACE, TYPE } from '../../layout'
import { buildEndOf, prog, revealAt } from '../../motion'
import Body from '../../parts/Body'
import Foot from '../../parts/Foot'
import Header from '../../parts/Header'
import { SEASON_HEADLINE, SEASON_KICKER } from '../copy'
import { Card } from '../parts'
import type { PitcherReelData } from '../types'

type P = { d: PitcherReelData; localT: number; dur: number }

const LABEL_W = 250, COL_W = (SAFE_W - LABEL_W - 80) / 3, HDR_H = 44, CARD_H = ROW.stat + 40

export default function Season({ d, localT, dur }: P) {
  const be = buildEndOf(dur)
  const rows = d.season
  const bodyH = HDR_H + rows.length * CARD_H + SPACE.s * rows.length
  const fmt = (v: number | null, dec: number) => (v == null ? '—' : v.toFixed(dec))
  const hdr = (t: string) => <div style={{ width: COL_W, textAlign: 'right', fontFamily: SANS, fontSize: TYPE.foot, color: 'rgba(250,248,243,.7)' }}>{t}</div>
  return (
    <>
      <Header kicker={SEASON_KICKER} headline={SEASON_HEADLINE} />
      <Body gap={SPACE.s}>
        <div style={{ display: 'flex', height: HDR_H, alignItems: 'center', paddingRight: 40, paddingLeft: 40, width: SAFE_W, boxSizing: 'border-box' }}>
          <div style={{ width: LABEL_W }} />{hdr('THIS START')}{hdr('SEASON')}{hdr('DIFF')}
        </div>
        {rows.map((r, i) => {
          const diff = r.game != null && r.season != null ? r.game - r.season : null
          const tiny = diff != null && Math.abs(diff) < Math.pow(10, -r.decimals) / 2
          const good = diff == null || tiny ? null : r.lowerBetter ? diff < 0 : diff > 0
          const color = good == null ? '#8a8275' : good ? '#1D9E75' : '#D4533B'
          const cell = (txt: string, c: string) => <div style={{ width: COL_W, textAlign: 'right', fontFamily: SANS, fontWeight: 800, fontSize: TYPE.statNum - 12, color: c, fontVariantNumeric: 'tabular-nums' }}>{txt}</div>
          return (
            <Card key={r.label} p={prog(localT, revealAt(i, rows.length, be), 0.25)} style={{ width: SAFE_W, height: CARD_H, padding: '0 40px', display: 'flex', alignItems: 'center' }}>
              <div style={{ width: LABEL_W, fontFamily: SANS, fontWeight: 800, fontSize: TYPE.body, color: '#1A1A1A', whiteSpace: 'nowrap' }}>{r.label}</div>
              {cell(fmt(r.game, r.decimals), '#1A1A1A')}
              {cell(fmt(r.season, r.decimals), '#8a8275')}
              {cell(diff == null ? '—' : `${diff > 0 ? '+' : diff < 0 ? '−' : ''}${Math.abs(diff).toFixed(r.decimals)}`, color)}
            </Card>
          )
        })}
      </Body>
      <Foot after={BODY_TOP + bodyH} lines={2}>{`Rates from ${d.line.ip} IP swing a lot in one start · green = better than his season mark`}</Foot>
    </>
  )
}
