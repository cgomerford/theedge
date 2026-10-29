// src/components/me/StatusStrip.tsx: four tiles across the top of My x9Lab: Following, Season, Recaps, Plan. Server component; no price anywhere (Free shows a "See Pro" link).
import Link from 'next/link'
import { FREE_LIMITS, OPENING_DAY } from '@/lib/follows/config'
import { CARD, EYEBROW, GREY, NUMS, C, SANS, dateLong } from './ui'

function Tile({ label, value, sub }: { label: string; value: string; sub: React.ReactNode }) {
  return (
    <div style={{ ...CARD, padding: '14px 16px' }}>
      <div style={EYEBROW}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.15, margin: '6px 0 4px', fontFamily: SANS }}>{value}</div>
      <div style={{ fontSize: 13, color: GREY, lineHeight: 1.4, ...NUMS }}>{sub}</div>
    </div>
  )
}

export default function StatusStrip({ players, teams, isPro, inSeason, teamLine, nextGame }: { players: number; teams: number; isPro: boolean; inSeason: boolean; teamLine: string | null; nextGame: string | null }) {
  return (
    <div className="me-strip" role="list">
      <Tile label="Following" value={`${players} player${players === 1 ? '' : 's'} · ${teams} team${teams === 1 ? '' : 's'}`}
        sub={isPro ? `${players} players · ${teams} teams` : `${players} of ${FREE_LIMITS.player} players, ${teams} of ${FREE_LIMITS.team} teams (Free)`} />
      <Tile label="Season" value={inSeason ? 'In season' : 'Off-season'}
        sub={inSeason ? (nextGame ?? 'pending') : `${teamLine ? `${teamLine} · ` : ''}Opening Day ${dateLong(OPENING_DAY)}`} />
      <Tile label="Recaps" value="Pending" sub="Preview below" />
      <Tile label="Plan" value={isPro ? 'Pro' : 'Free'} sub={isPro ? 'Active' : <Link href="/pricing" style={{ color: C.orange, fontWeight: 800, textDecoration: 'none' }}>See Pro</Link>} />
    </div>
  )
}
