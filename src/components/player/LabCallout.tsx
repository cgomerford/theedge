// src/components/player/LabCallout.tsx
//
// The bridge between the basic player stats page (/mlb/players/[id]) and the
// advanced Batting / Pitching Labs. The stats page deliberately stops at
// traditional stats, form and career context; anything pitch-level (zones,
// arsenal, sequencing, spray) lives in the lab. This component says so in
// plain language and deep-links to each lab tab so the hand-off is one click.
//
// Server-safe (no hooks, no client state) — plain <Link>s only. Takes `subject`
// as a required prop; there's no gating logic here on purpose (both labs
// enforce their own access), so no isPro prop is needed.

import Link from 'next/link'

type LabSubject = 'batter' | 'pitcher'

type LabTile = { seg: string; label: string; blurb: string }

// Tab names mirror the lab layouts' own TABS arrays
// (batting-lab/[playerId]/layout.tsx, pitching-lab/[playerId]/layout.tsx).
// The pitching lab's "Edge+" tab is intentionally not promoted here — it's
// built on the internal score, which stays off casual-facing surfaces.
const LAB: Record<LabSubject, { name: string; base: string; pitch: string; tiles: LabTile[] }> = {
  batter: {
    name: 'Batting Lab',
    base: '/mlb/batting-lab',
    pitch: 'how he handles every pitch type, where he does damage, and how pitchers attack him',
    tiles: [
      { seg: 'arsenal', label: 'Vs Arsenal', blurb: 'Results against each pitch type' },
      { seg: 'location', label: 'Location Lab', blurb: 'Where he hits and misses' },
      { seg: 'hot-zones', label: 'Hot Zone Overlay', blurb: 'Zone maps by pitch type' },
      { seg: 'sequencing', label: 'Sequencing', blurb: 'How pitchers work him' },
      { seg: 'trends', label: 'Trends', blurb: 'Contact quality over time' },
      { seg: 'h2h', label: 'H2H', blurb: 'Career vs specific pitchers' },
    ],
  },
  pitcher: {
    name: 'Pitching Lab',
    base: '/mlb/pitching-lab',
    pitch: 'every pitch in his arsenal, where he locates it, and how he sequences hitters',
    tiles: [
      { seg: 'arsenal', label: 'Arsenal', blurb: 'Velocity, movement, usage per pitch' },
      { seg: 'location', label: 'Location Lab', blurb: 'Where each pitch lands' },
      { seg: 'overlay', label: 'Hot Zone Overlay', blurb: 'Zone maps vs hitters' },
      { seg: 'sequencing', label: 'Sequencing', blurb: 'Pitch order by count' },
      { seg: 'trends', label: 'Trends', blurb: 'Stuff and results over time' },
      { seg: 'h2h', label: 'H2H', blurb: 'Career vs specific hitters' },
    ],
  },
}

export default function LabCallout({
  playerId, playerName, subject, variant, otherLab,
}: {
  playerId: number
  playerName: string
  subject: LabSubject
  /** 'banner' = short strip under the identity header; 'full' = tile grid at the bottom of the page. */
  variant: 'banner' | 'full'
  /** Two-way players (e.g. Ohtani) also get a link to the other lab. */
  otherLab?: LabSubject | null
}) {
  const lab = LAB[subject]
  const labHref = `${lab.base}/${playerId}`
  const other = otherLab && otherLab !== subject ? LAB[otherLab] : null

  if (variant === 'banner') {
    return (
      <div className="border border-[#FF5722]/30 bg-[#FFF3E0] rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="font-sans text-[13px] text-stone-800 flex-1 min-w-[240px] leading-snug">
          This page covers the basics — season line, form, career. Want the advanced look at {lab.pitch}?
          Open {playerName.split(' ').slice(-1)[0]}&apos;s {lab.name}.
        </p>
        <div className="flex items-center gap-3 shrink-0">
          <Link href={labHref} className="font-mono text-[10px] uppercase tracking-widest bg-[#1A1A1A] text-[#FAF8F3] px-3.5 py-2 rounded-lg hover:bg-[#FF5722] transition">
            Open {lab.name} →
          </Link>
          {other && (
            <Link href={`${other.base}/${playerId}`} className="font-mono text-[10px] uppercase tracking-widest text-[#FF5722] hover:underline">
              {other.name} →
            </Link>
          )}
        </div>
      </div>
    )
  }

  return (
    <section className="border border-stone-200 bg-white rounded-xl shadow-sm p-5">
      <p className="font-mono text-[10px] uppercase tracking-widest text-[#FF5722] font-bold mb-1">⊕ Go deeper · {lab.name}</p>
      <h2 className="font-sans text-lg font-bold text-stone-900 leading-tight">Want the advanced look?</h2>
      <p className="font-sans text-[13px] text-stone-600 mt-1 mb-4 max-w-[640px] leading-snug">
        Everything above is the basic view. The {lab.name} shows {lab.pitch} — pitch-level Statcast data that
        doesn&apos;t fit on a stats page. Jump straight into a section:
      </p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {lab.tiles.map(t => (
          <Link
            key={t.seg}
            href={`${labHref}/${t.seg}`}
            className="border border-stone-200 rounded-lg p-3 hover:border-[#FF5722] hover:bg-[#FFF8F3] transition"
          >
            <div className="font-mono text-[10px] uppercase tracking-widest text-stone-900 font-bold">{t.label}</div>
            <div className="font-sans text-[12px] text-stone-500 mt-0.5 leading-snug">{t.blurb}</div>
          </Link>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <Link href={labHref} className="font-mono text-[10px] uppercase tracking-widest bg-[#1A1A1A] text-[#FAF8F3] px-3.5 py-2 rounded-lg hover:bg-[#FF5722] transition">
          Open {lab.name} overview →
        </Link>
        {other && (
          <Link href={`${other.base}/${playerId}`} className="font-mono text-[10px] uppercase tracking-widest text-[#FF5722] hover:underline">
            Also in the {other.name} →
          </Link>
        )}
      </div>
    </section>
  )
}
