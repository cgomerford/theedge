'use client'

/**
 * src/app/nfl/NFLHomepage.tsx
 * Restyled to match The Edge brand — cream bg, Fraunces, orange accents.
 * Sections:
 *   1. Hero
 *   2. Key Dates countdown strip (dark)
 *   3. Fantasy Focus (what to watch this pre-season)
 *   4. Team Records grid (AFC/NFC toggle)
 *   5. Stat Leaders
 *   6. New to the NFL — glossary / terminology explainer
 *   7. News
 */

import { useState } from 'react'
import Link from 'next/link'
import type { NFLDivision, NFLStatLeader, NFLNewsItem, NFLTeamCard, NFLKeyDate } from '@/lib/nfl'
import { STAT_CATEGORIES } from '@/lib/nfl'

type Props = {
  standings: NFLDivision[]
  statLeaders: Record<string, { leaders: NFLStatLeader[]; season: number }>
  news: NFLNewsItem[]
  teams: NFLTeamCard[]
  keyDates: NFLKeyDate[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3_600_000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + 'T00:00:00')
  return Math.ceil((target.getTime() - Date.now()) / 86_400_000)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  })
}

// ── Section Label ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span className="font-mono text-[10px] uppercase tracking-widest text-orange-600 font-bold whitespace-nowrap">
        § {children}
      </span>
      <div className="flex-1 h-px bg-stone-200" />
    </div>
  )
}

// ── Key Dates Strip ───────────────────────────────────────────────────────────

function KeyDatesStrip({ dates }: { dates: NFLKeyDate[] }) {
  const nextIndex = dates.findIndex(d => daysUntil(d.date) >= 0)

  return (
    <div className="rounded-xl overflow-hidden mb-10" style={{ background: '#1A1A1A' }}>
      <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
        <span className="font-mono text-[9px] uppercase tracking-widest text-orange-500">
          ⊕ 2026 Season countdown
        </span>
        <span className="font-mono text-[9px] text-stone-500 uppercase tracking-wider">
          Kickoff Sep 9
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5">
        {dates.map((d, i) => {
          const days = daysUntil(d.date)
          const isPast = days < 0
          const isNext = i === nextIndex
          return (
            <div
              key={d.label}
              className="px-4 py-4 flex flex-col gap-1 border-r border-b border-white/5 last:border-r-0"
              style={{ background: isNext ? 'rgba(255,87,34,0.08)' : undefined }}
            >
              <div className="font-mono text-[9px] uppercase tracking-widest text-stone-500">
                {formatDate(d.date)}
              </div>
              <div className="font-serif text-sm font-bold text-stone-100 leading-tight">
                {d.label}
              </div>
              <div className="font-mono text-[9px] text-stone-500 leading-snug">{d.description}</div>
              <div className="mt-1">
                {isPast ? (
                  <span className="font-mono text-[9px] text-stone-600">Complete</span>
                ) : (
                  <span
                    className="font-mono text-[10px] font-bold"
                    style={{ color: isNext ? '#FF5722' : '#78716C' }}
                  >
                    {days === 0 ? 'Today' : `${days}d away`}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Fantasy Focus ─────────────────────────────────────────────────────────────

const FANTASY_FOCUS_ITEMS = [
  {
    icon: '⊕',
    label: 'Draft season',
    body: 'Most fantasy drafts run late August. The Edge will publish weekly ADP tracking and positional value scores from Week 1 — bookmark this page and watch this space.',
  },
  {
    icon: '⊕',
    label: 'Training camp intel',
    body: 'Depth chart battles decide breakout candidates. Camp opens late July — The Edge will flag role changes that move fantasy value before the broader market reacts.',
  },
  {
    icon: '⊕',
    label: 'Two-QB leagues',
    body: 'Quarterback scarcity flips the entire board. If your league starts 2 QBs, tier 2 QBs are first-round value. We\'ll publish format-adjusted rankings from August.',
  },
  {
    icon: '⊕',
    label: 'Injury watch',
    body: 'Preseason games (Aug 8 onward) produce the injuries that define the season. The Edge transaction wire will flag every meaningful roster move within hours.',
  },
]

function FantasyFocusStrip() {
  return (
    <section className="mb-12">
      <SectionLabel>Fantasy Focus — What to Watch</SectionLabel>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {FANTASY_FOCUS_ITEMS.map((item, i) => (
          <div
            key={i}
            className="bg-white border border-stone-200 rounded-xl px-5 py-4"
          >
            <div className="font-mono text-[9px] uppercase tracking-widest text-orange-500 font-bold mb-2">
              {item.icon} {item.label}
            </div>
            <p className="font-serif text-sm text-stone-600 leading-relaxed">{item.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

// ── Team Card ─────────────────────────────────────────────────────────────────

function TeamCard({ team }: { team: NFLTeamCard }) {
  const record = `${team.wins}–${team.losses}${team.ties > 0 ? `–${team.ties}` : ''}`
  return (
    <Link
      href={`/nfl/teams/${team.abbreviation.toLowerCase()}`}
      className="bg-white border border-stone-200 rounded-xl p-3 hover:border-stone-300 hover:shadow-sm transition flex items-center gap-3"
    >
      {team.logo && (
        <img src={team.logo} alt={team.abbreviation}
          className="w-8 h-8 object-contain shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="font-serif text-sm font-semibold text-stone-900 truncate leading-tight">
          {team.shortName}
        </div>
        <div className="font-mono text-[9px] text-stone-400 uppercase tracking-wider mt-0.5">
          {team.abbreviation}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="font-mono text-sm font-bold text-stone-700">{record}</div>
        <div className="font-mono text-[9px] text-stone-400">2025</div>
      </div>
    </Link>
  )
}

// ── Teams Grid ────────────────────────────────────────────────────────────────

function TeamsGrid({ teams }: { teams: NFLTeamCard[] }) {
  const [activeConf, setActiveConf] = useState<'AFC' | 'NFC'>('AFC')
  const filtered = teams.filter(t => t.conference === activeConf)
  const divisions = ['East', 'North', 'South', 'West']

  return (
    <section className="mb-12">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-widest text-orange-600 font-bold">
            § 2025 Team Records
          </span>
          <div className="flex-1 h-px bg-stone-200 w-16" />
        </div>
        <div className="flex gap-1">
          {(['AFC', 'NFC'] as const).map(c => (
            <button
              key={c}
              onClick={() => setActiveConf(c)}
              className={`px-3 py-1 font-mono text-xs uppercase tracking-widest transition rounded-lg ${
                activeConf === c
                  ? 'bg-stone-900 text-white'
                  : 'text-stone-500 hover:text-stone-800 border border-stone-200 bg-white'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {divisions.map(div => {
          const divTeams = filtered.filter(t => t.division === div)
          if (!divTeams.length) return null
          return (
            <div key={div}>
              <div className="font-mono text-[9px] uppercase tracking-widest text-stone-400 mb-2 px-1">
                {activeConf} {div}
              </div>
              <div className="space-y-2">
                {divTeams.map(team => <TeamCard key={team.id} team={team} />)}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ── Stat Leaders ──────────────────────────────────────────────────────────────

function StatLeadersPanel({ leaders, label, season }: {
  leaders: NFLStatLeader[]
  label: string
  season: number
}) {
  const isLastSeason = season < new Date().getFullYear()

  if (!leaders?.length) {
    return (
      <div className="bg-white border border-stone-200 rounded-xl px-4 py-10 text-center font-serif italic text-stone-400 text-sm">
        No data yet — check back when the 2026 season is underway.
      </div>
    )
  }

  return (
    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
      {isLastSeason && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-100">
          <span className="font-mono text-[9px] uppercase tracking-widest text-amber-600">
            ⊕ {season} season leaders — 2026 stats available from Week 1
          </span>
        </div>
      )}
      <div className="divide-y divide-stone-100">
        {leaders.slice(0, 5).map(leader => (
          <div key={`${leader.rank}-${leader.name}`}
            className="flex items-center gap-3 px-4 py-3 hover:bg-stone-50 transition">
            <span className="font-mono text-[10px] text-stone-400 w-4 shrink-0">{leader.rank}</span>
            {leader.headshot && (
              <img src={leader.headshot} alt={leader.name}
                className="w-10 h-10 rounded-full object-cover bg-stone-100 shrink-0"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            )}
            <div className="flex-1 min-w-0">
              <div className="font-serif text-sm font-semibold text-stone-900 truncate">{leader.name}</div>
              <div className="font-mono text-[9px] uppercase text-stone-400 mt-0.5">{leader.teamAbbr}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="font-bold leading-none" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '26px', color: '#1A1A1A' }}>
                {leader.statValue}
              </div>
              <div className="font-mono text-[9px] uppercase tracking-wider text-stone-400 mt-0.5">{label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── New to the NFL ────────────────────────────────────────────────────────────

const NFL_GLOSSARY = [
  {
    category: 'Coverages',
    color: '#2563EB',
    bg: 'rgba(37,99,235,0.06)',
    terms: [
      { term: 'Cover 0', def: 'Zero zone defenders — every DB in man coverage, no safety help. Maximum pressure, maximum risk. If the receiver wins his route, it\'s a touchdown.' },
      { term: 'Cover 1', def: 'One deep safety in the middle of the field, everyone else in man coverage. The safety is the insurance policy.' },
      { term: 'Cover 2', def: 'Two safeties split the deep field in half. CBs take the flats. The weakness: the middle of the field between the safeties (the "hole").' },
      { term: 'Cover 3', def: 'Three deep zones — two CBs and one safety each take a third of the field. Good against the deep ball, vulnerable to crossing routes underneath.' },
      { term: 'Cover 4 (Quarters)', def: 'Four defenders each take a quarter of the deep field. Very conservative. Limits big plays but can get beaten underneath.' },
      { term: 'Tampa 2', def: 'A variant of Cover 2 where the MLB drops deep into the middle hole. Made famous by the early-2000s Tampa Bay Buccaneers.' },
      { term: 'Man coverage', def: 'Each DB is assigned a specific receiver to follow wherever they go. Requires athletic corners; one bad matchup and it breaks down.' },
      { term: 'Zone coverage', def: 'Each DB is responsible for an area of the field, not a specific player. Reads and reacts to routes entering their zone.' },
    ],
  },
  {
    category: 'Formations & Alignments',
    color: '#15803D',
    bg: 'rgba(21,128,61,0.06)',
    terms: [
      { term: 'Slot receiver', def: 'The receiver lined up inside the numbers, between the outside WR and the offensive line. Usually the shiftiest, hardest to cover. The slot is the most targeted position in modern NFL.' },
      { term: 'Z receiver', def: 'The wide receiver lined up off the line of scrimmage on the backside. Typically the team\'s best route runner — able to go in motion before the snap.' },
      { term: 'X receiver', def: 'The wide receiver lined up on the line of scrimmage, usually to the strong side. Typically the team\'s biggest, most physical receiver.' },
      { term: 'Y receiver (TE)', def: 'The tight end aligned on the line of scrimmage next to the offensive tackle. Blocker first, pass catcher second in traditional sets.' },
      { term: 'Bunch formation', def: 'Three receivers clustered tight together pre-snap. Creates natural picks and rubs that disrupt man coverage. Hard to cover cleanly.' },
      { term: 'Empty backfield', def: 'No running back in the backfield — all five skill players split out wide. Forces the defense to declare its coverage. High-risk, high-reward.' },
      { term: 'Under center', def: 'QB lines up directly behind the center to take a direct snap. Enables play-action and the run game. Contrasts with shotgun.' },
      { term: 'Shotgun', def: 'QB lines up 4–5 yards behind the center, taking a long snap. Better passing platform; more telegraph of pass intent.' },
    ],
  },
  {
    category: 'Pass Routes',
    color: '#D97706',
    bg: 'rgba(217,119,6,0.06)',
    terms: [
      { term: 'Slant', def: 'Receiver runs 2–3 steps straight, then cuts 45° toward the middle. Quick, high-percentage throw. Destroys Cover 0 and man coverage.' },
      { term: 'Dig (In route)', def: 'Receiver runs 10–12 yards straight, then cuts sharply 90° toward the middle. Attacks the void in Cover 2.' },
      { term: 'Post', def: 'Receiver runs straight then cuts 45° toward the goalpost. Attacks the deep middle — the hole in Cover 2.' },
      { term: 'Corner route', def: 'Receiver runs straight then cuts 45° toward the corner of the end zone. Beats Cover 2 by attacking the sideline behind the CB.' },
      { term: 'Go route (Fly)', def: 'Straight line, full speed, down the sideline. Pure speed test. Creates vertical stress on the defense.' },
      { term: 'Curl', def: 'Receiver runs to a depth, then turns back toward the QB. Safe, high-percentage. Runs away from zone defenders.' },
      { term: 'Wheel route', def: 'RB or slot receiver runs flat, then turns up the sideline. Creates a natural pick situation off the RB\'s initial flat route.' },
      { term: 'Mesh', def: 'Two receivers cross in the middle of the field at the same depth. Creates natural traffic that disrupts man coverage.' },
    ],
  },
  {
    category: 'The Running Game',
    color: '#7C3AED',
    bg: 'rgba(124,58,237,0.06)',
    terms: [
      { term: 'Inside zone', def: 'OL moves laterally as a unit, each lineman blocks a zone. RB reads the blocks and picks his gap. Most common run scheme in the NFL.' },
      { term: 'Outside zone', def: 'Same as inside zone but the flow goes toward the sideline. RB aims for the edge; if it\'s closed, cuts back. Requires athletic linemen.' },
      { term: 'Power', def: 'A guard pulls from one side to lead block through a specific hole. Downhill, physical run. Common in short-yardage.' },
      { term: 'Counter', def: 'Designed to look like a run one direction, then go the other. Two pullers (guard + fullback) lead through the backside gap. Great against overaggressive defenses.' },
      { term: 'RPO (Run-Pass Option)', def: 'QB reads a defender post-snap — if the defender crashes on the run, throw the quick pass; if he drops, hand off. Essentially makes the defense wrong no matter what.' },
      { term: 'Stretch play', def: 'RB aims for the perimeter, forcing the defense to run sideline-to-sideline. Creates cutback lanes when defenders over-pursue.' },
    ],
  },
  {
    category: 'Defensive Fronts',
    color: '#DC2626',
    bg: 'rgba(220,38,38,0.06)',
    terms: [
      { term: '4-3 defense', def: 'Four defensive linemen, three linebackers. Traditional base. Strong against the run with four down linemen.' },
      { term: '3-4 defense', def: 'Three defensive linemen, four linebackers. More versatile — the fourth LB can rush or drop into coverage. Disguises pressure better.' },
      { term: 'EDGE rusher', def: 'The most valuable position on defense. Lines up on the perimeter, primary job is to pressure the QB. Think Myles Garrett, Micah Parsons.' },
      { term: 'Mike linebacker', def: 'The middle linebacker — the defensive quarterback. Makes pre-snap calls, fills run gaps, often covers the RB in pass coverage.' },
      { term: 'Nickel defense', def: 'Five defensive backs (adding a nickel CB). Used when the offense goes to 3+ receiver sets. Now the NFL\'s base defense, not a specialty package.' },
      { term: 'Dime defense', def: 'Six defensive backs. Used in obvious passing situations. Sacrifices run-stopping for pass coverage.' },
      { term: 'Blitz', def: 'Sending more than four pass rushers. More pressure on the QB, but fewer defenders in coverage. If blocked, leaves receivers open.' },
      { term: 'Cover 2 shell', def: 'Two safeties showing deep pre-snap. Looks like Cover 2 but can rotate to Cover 1 or 3 at the snap. Designed to confuse the QB\'s read.' },
    ],
  },
  {
    category: 'Fantasy & Analytics Terms',
    color: '#FF5722',
    bg: 'rgba(255,87,34,0.06)',
    terms: [
      { term: 'Air yards', def: 'How far the ball travels in the air before it\'s caught (or falls incomplete). High air yards = deep threat. The Edge model uses this to measure pass-game aggression.' },
      { term: 'Target share', def: 'Percentage of the team\'s total targets that go to a specific receiver. 25%+ is elite. More predictive of fantasy output than catches.' },
      { term: 'RACR', def: 'Receiver Air Conversion Ratio — receiving yards divided by air yards. Measures how efficiently a receiver converts his targets into yards. High RACR = creates after the catch.' },
      { term: 'DVOA', def: 'Defense-adjusted Value Over Average — measures efficiency relative to the average play in that situation. Negative DVOA for defense is good (better than average).' },
      { term: 'EPA (Expected Points Added)', def: 'How many points a play added above what was expected given down, distance, and field position. Positive EPA = good play. The Edge uses this for QB and OL evaluation.' },
      { term: 'Snap count', def: 'How many plays a player was on the field. Essential for fantasy — a RB with 80% snap share is far more valuable than one sharing carries.' },
      { term: 'Red zone target share', def: 'Percentage of red zone targets (inside the 20-yard line) going to a receiver. The single best predictor of TD upside in fantasy.' },
      { term: 'ADP (Average Draft Position)', def: 'Where a player is typically being drafted across fantasy platforms. If you believe a player is better than their ADP, take them early. Arbitrage opportunity.' },
    ],
  },
]

function NFLGlossary() {
  const [activeCategory, setActiveCategory] = useState(NFL_GLOSSARY[0].category)
  const [expandedTerm, setExpandedTerm] = useState<string | null>(null)

  const current = NFL_GLOSSARY.find(g => g.category === activeCategory)!

  return (
    <section className="mb-12">
      <SectionLabel>New to the NFL? — The Glossary</SectionLabel>
      <div
        className="px-4 py-3 rounded-r-lg border-l-[3px] border-yellow-400 mb-5 font-serif italic text-sm text-stone-600 leading-relaxed"
        style={{ background: 'rgba(253,224,71,0.07)' }}
      >
        The NFL has its own language — coverages, route trees, analytics terms that commentators throw around like everyone knows them. Here's your cheat sheet. Tap any term to expand.
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 flex-wrap mb-4">
        {NFL_GLOSSARY.map(g => (
          <button
            key={g.category}
            onClick={() => { setActiveCategory(g.category); setExpandedTerm(null) }}
            className="font-mono text-[9px] uppercase tracking-wider px-3 py-1.5 rounded-lg transition-colors"
            style={{
              background: activeCategory === g.category ? current.color : 'white',
              color: activeCategory === g.category ? 'white' : '#78716C',
              border: `1px solid ${activeCategory === g.category ? current.color : '#E7E5E4'}`,
            }}
          >
            {g.category}
          </button>
        ))}
      </div>

      {/* Term list */}
      <div
        className="bg-white border border-stone-200 rounded-xl overflow-hidden"
        style={{ borderTop: `3px solid ${current.color}` }}
      >
        {current.terms.map((item, i) => (
          <div
            key={item.term}
            className="border-b border-stone-50 last:border-0"
          >
            <button
              className="w-full text-left px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-stone-50 transition-colors"
              onClick={() => setExpandedTerm(expandedTerm === item.term ? null : item.term)}
            >
              <div className="flex items-center gap-3">
                <span
                  className="font-mono text-[9px] font-bold w-5 text-center shrink-0"
                  style={{ color: current.color }}
                >
                  {i + 1}
                </span>
                <span className="font-serif font-semibold text-stone-900 text-sm">{item.term}</span>
              </div>
              <span className="font-mono text-stone-300 text-xs shrink-0">
                {expandedTerm === item.term ? '▲' : '▼'}
              </span>
            </button>
            {expandedTerm === item.term && (
              <div
                className="px-5 pb-4 pt-1"
                style={{ background: current.bg }}
              >
                <p className="font-serif text-sm text-stone-600 leading-relaxed pl-8">
                  {item.def}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

// ── News Card ─────────────────────────────────────────────────────────────────

function NewsCard({ item, featured }: { item: NFLNewsItem; featured?: boolean }) {
  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      className={`block bg-white border border-stone-200 rounded-xl overflow-hidden hover:border-stone-300 hover:shadow-sm transition group${featured ? ' md:col-span-2' : ''}`}
    >
      {featured && (
        item.image
          ? <img src={item.image} alt="" className="w-full h-44 object-cover" />
          : <div className="w-full h-20 bg-gradient-to-r from-stone-100 to-stone-50" />
      )}
      <div className="p-4">
        <h3 className={`font-serif font-semibold text-stone-900 leading-snug group-hover:text-orange-600 transition mb-1 ${featured ? 'text-lg' : 'text-sm'}`}>
          {item.headline}
        </h3>
        {item.description && (
          <p className="font-serif text-stone-500 text-xs leading-relaxed line-clamp-2 mb-2">{item.description}</p>
        )}
        <div className="font-mono text-[9px] uppercase tracking-widest text-stone-400">
          {timeAgo(item.published)}
        </div>
      </div>
    </a>
  )
}

// ── Standings (in-season only) ────────────────────────────────────────────────

function StandingsSection({ standings }: { standings: NFLDivision[] }) {
  if (!standings.length) return null
  return (
    <section className="mb-12">
      <SectionLabel>Division Standings</SectionLabel>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {standings.map(div => (
          <div key={div.name} className="bg-white border border-stone-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-stone-100 bg-stone-50">
              <span className="font-mono text-[10px] uppercase tracking-widest text-stone-500">{div.name}</span>
            </div>
            <div className="divide-y divide-stone-100">
              {div.teams.map(team => (
                <div key={team.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-stone-50 transition">
                  {team.logo && <img src={team.logo} alt={team.abbreviation} className="w-5 h-5 object-contain" />}
                  <div className="flex-1 font-serif text-sm font-semibold text-stone-900">{team.name}</div>
                  <div className="font-mono text-sm text-stone-600">{team.wins}–{team.losses}</div>
                  <div className="font-mono text-xs text-stone-400">{team.pct}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function NFLHomepage({ standings, statLeaders, news, teams, keyDates }: Props) {
  const [activeStat, setActiveStat] = useState(STAT_CATEGORIES[0]?.slug ?? '')

  const currentData = statLeaders[activeStat] ?? { leaders: [], season: 2025 }
  const currentCat = STAT_CATEGORIES.find(c => c.slug === activeStat)
  const isPreSeason = standings.length === 0

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 pb-16">

      {/* ── Hero ── */}
      <div className="py-10 md:py-14 border-b border-stone-200 mb-10">
        <div className="font-mono text-[9px] uppercase tracking-widest text-orange-600 mb-3">
          § The Edge · NFL
        </div>
        <h1 className="font-serif text-4xl md:text-5xl font-bold text-stone-900 leading-none tracking-tight mb-3">
          The GM Brief<span className="text-[#FF5722]">.</span>
        </h1>
        <p className="font-serif italic text-stone-500 text-base md:text-lg max-w-xl">
          {isPreSeason
            ? 'Off-season hub — full game analysis and predictions live from Week 1, September 9.'
            : 'Division standings, stat leaders, and what matters — in five minutes.'}
        </p>
        {isPreSeason && (
          <div className="mt-6 flex items-center gap-4 flex-wrap">
            <Link
              href="/pricing"
              className="font-mono text-[10px] uppercase tracking-widest bg-[#FF5722] text-white px-5 py-2.5 rounded-sm hover:bg-orange-700 transition"
            >
              Get Pro for NFL →
            </Link>
            <span className="font-serif italic text-stone-400 text-sm">
              Fantasy Desk, game previews, and the model live from Week 1.
            </span>
          </div>
        )}
      </div>

      {/* ── Key Dates ── */}
      <KeyDatesStrip dates={keyDates} />

      {/* ── Fantasy Focus ── */}
      <FantasyFocusStrip />

      {/* ── Teams grid ── */}
      {teams.length > 0 && <TeamsGrid teams={teams} />}

      {/* ── Stat Leaders ── */}
      <section className="mb-12">
        <SectionLabel>Statistical Leaders — 2025 Season</SectionLabel>
        <div className="flex gap-1.5 flex-wrap mb-4">
          {STAT_CATEGORIES.map(cat => (
            <button
              key={cat.slug}
              onClick={() => setActiveStat(cat.slug)}
              className={`font-mono text-[9px] uppercase tracking-widest px-3 py-1.5 rounded-lg transition-colors ${
                activeStat === cat.slug
                  ? 'bg-stone-900 text-white'
                  : 'text-stone-500 hover:text-stone-800 border border-stone-200 bg-white'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
        <StatLeadersPanel
          leaders={currentData.leaders}
          label={currentCat?.label ?? activeStat}
          season={currentData.season}
        />
      </section>

      {/* ── In-season standings ── */}
      <StandingsSection standings={standings} />

      {/* ── New to the NFL glossary ── */}
      <NFLGlossary />

      {/* ── News ── */}
      <section>
        <SectionLabel>Around the League</SectionLabel>
        {news.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-xl px-4 py-10 text-center font-serif italic text-stone-400 text-sm">
            News unavailable — check back shortly.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {news.map((item, i) => (
              <NewsCard key={item.id} item={item} featured={i === 0} />
            ))}
          </div>
        )}
      </section>

    </div>
  )
}