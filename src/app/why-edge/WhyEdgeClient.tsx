'use client'

// src/app/why-edge/WhyEdgeClient.tsx

import { useState } from 'react'
import Link from 'next/link'

// ─── Types ────────────────────────────────────────────────────────────────────

type OverallStats = {
  total_reviewed: number
  total_matched: number
  alignment_percent: number | null
  insufficient_sample: boolean
  date_range_start: string | null
  date_range_end: string | null
}

type Props = { stats: OverallStats }

type Tab = 'levels' | 'compare' | 'archive'

// ─── Static data ─────────────────────────────────────────────────────────────

const FACTORS = [
  { name: 'Starting Pitcher', score: 62,  label: 'CHC ↑↑' },
  { name: 'Bullpen',          score: -28, label: 'STL ↑'  },
  { name: 'Offensive Form',   score: 18,  label: 'CHC ↑'  },
  { name: 'Matchup',          score: 3,   label: 'EVEN'   },
  { name: 'Park Factor',      score: 12,  label: 'CHC ↑'  },
  { name: 'Rest & Travel',    score: -2,  label: 'EVEN'   },
]

const GAPS = [
  { them: 'Instant answer, no model',            us: '8-factor rule-based model — public weights, no black box'       },
  { them: 'No history, no accountability',        us: 'Every read archived — factor lean vs actual result, always'    },
  { them: '"Both teams have been competitive"',   us: '"Taillon 1.98 ERA L4 · Cardinals pen used 8.2 IP yesterday"'   },
  { them: 'One paragraph and done',               us: 'Daily email + Dugout dashboard + team follows'                 },
  { them: 'No fantasy utility',                   us: 'Pro: Bullpen Status, Start/Sit, Hot Zones, GM briefing'        },
  { them: 'Same answer for everyone',             us: 'Personalised to your teams, your sport, your level'            },
]

const LEVELS = [
  {
    num: '01',
    who: 'New fan',
    what: 'The verdict',
    tier: 'Free',
    note: 'Who holds the data factors and why — in one sentence.',
    demo: {
      label: '— Tonight\'s read',
      text: 'Phillies hold the data factors tonight.',
    },
  },
  {
    num: '02',
    who: 'Casual',
    what: 'The story',
    tier: 'Free',
    note: 'Story lead, top factors, projected lineups.',
    demo: {
      label: '§ The Story',
      text: 'Wheeler\'s been ridiculous lately — three straight under 2 ERA. The Mets bullpen is gassed after last night\'s marathon. Phillies have more data factors here.',
    },
  },
  {
    num: '03',
    who: 'Regular',
    what: 'The playbook',
    tier: 'Pro',
    note: 'Full 4-sentence read, all 8 factors, arsenal chart.',
    demo: {
      label: '— The Read',
      text: 'Wheeler carries a 2.41 FIP and 11.2 K/9 into Citi Field tonight, facing a Mets side that burned six innings of relief yesterday. Manaea (4.18 FIP) is capable of keeping it close, but the bullpen gap is real. The data factors tilts Philly\'s way.',
    },
  },
  {
    num: '04',
    who: 'Analyst',
    what: 'The briefing',
    tier: 'Pro',
    note: 'GM briefing, bullpen fatigue tracker, contrarian take.',
    demo: {
      label: '⊕ GM Briefing',
      text: 'Wheeler\'s arsenal is grading elite by xERA (2.18) with 32% CSW% over his last four. Real concern: Strahm and Hoffman both threw 1.2 IP last night — Mets\' late innings are exposed.',
    },
  },
]

// ─── Factor bar ───────────────────────────────────────────────────────────────

function FactorBar({ name, score, label }: { name: string; score: number; label: string }) {
  const abs    = Math.abs(score)
  const isEven = abs <= 5
  const isHome = score > 0
  const color  = isEven ? '#A3A3A3' : isHome ? '#FF5722' : '#3B82F6'
  const pct    = Math.min(100, (abs / 70) * 100)

  return (
    <div className="flex items-center gap-3 py-2 border-b border-stone-100 last:border-0">
      <span className="font-mono text-[10px] uppercase tracking-wide text-stone-400 w-32 shrink-0">
        {name}
      </span>
      <div className="flex-1 h-[3px] bg-stone-100 relative overflow-hidden">
        <div
          className="absolute h-full"
          style={{
            width: `${pct}%`,
            background: color,
            left: !isHome && !isEven ? `${100 - pct}%` : 0,
          }}
        />
      </div>
      <span className="font-mono text-[10px] font-bold w-12 text-right shrink-0" style={{ color }}>
        {label}
      </span>
    </div>
  )
}

// ─── Level card ───────────────────────────────────────────────────────────────

function LevelCard({ level, active, onClick }: {
  level: typeof LEVELS[0]
  active: boolean
  onClick: () => void
}) {
  const isPro = level.tier === 'Pro'

  return (
    <button
      onClick={onClick}
      className={[
        'w-full text-left border transition-all duration-150',
        active
          ? 'border-[#FF5722] bg-white'
          : 'border-stone-200 bg-white hover:border-stone-400',
      ].join(' ')}
    >
      {/* Header row */}
      <div className={[
        'flex items-center justify-between px-4 py-3 border-b',
        active ? 'border-[#FF5722]/20 bg-orange-50/50' : 'border-stone-100 bg-[#FAF8F3]',
      ].join(' ')}>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] text-stone-400">{level.num}</span>
          <span className="font-serif text-[15px] font-semibold text-stone-900">{level.who}</span>
        </div>
        <span className={[
          'font-mono text-[9px] font-bold uppercase tracking-widest px-2 py-0.5',
          isPro
            ? 'bg-[#1A1A1A] text-[#FDE047]'
            : 'bg-stone-100 text-stone-500',
        ].join(' ')}>
          {isPro ? '⊕ Pro' : 'Free'}
        </span>
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        <div className="font-serif text-sm italic text-stone-500 mb-1">{level.what}</div>
        <div className="font-mono text-[10px] text-stone-400 leading-relaxed">{level.note}</div>
      </div>
    </button>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function WhyEdgeClient({ stats }: Props) {
  const [tab, setTab]         = useState<Tab>('levels')
  const [activeLevel, setActiveLevel] = useState(0)

  const level     = LEVELS[activeLevel]
  const alignPct  = stats.alignment_percent != null
    ? Math.round(stats.alignment_percent)
    : null
  const dateRange = stats.date_range_start && stats.date_range_end
    ? `${new Date(stats.date_range_start + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(stats.date_range_end + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    : null

  return (
    <main className="min-h-screen bg-[#FAF8F3]">
      <div className="max-w-2xl mx-auto px-5 sm:px-8 py-10 sm:py-14">

        {/* Back */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-[#FF5722] mb-8 hover:opacity-70 transition-opacity"
        >
          ← Back to home
        </Link>

        {/* Title */}
        <h1 className="text-5xl sm:text-6xl font-black tracking-tight leading-[1.05] mb-5 font-serif text-[#1A1A1A]">
          Why The Edge<span className="text-[#FF5722]">.</span>
        </h1>
        <p className="text-lg sm:text-xl text-stone-500 leading-relaxed mb-10 font-serif italic">
          The same game renders differently depending on how you watch it.
          The Edge meets you at your level — free for fans, deeper for analysts.
        </p>

        <hr className="border-stone-200 mb-10" />

        {/* Tabs */}
        <div className="flex border-b-2 border-[#1A1A1A] mb-10 -mx-1">
          {([
            ['levels',  'Four reads'],
            ['compare', 'vs Google AI'],
            ['archive', 'The Archive'],
          ] as [Tab, string][]).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={[
                'flex-1 py-3 font-mono text-[9px] sm:text-[10px] uppercase tracking-widest font-bold transition-colors border-b-2 -mb-[2px]',
                tab === id
                  ? 'text-[#FF5722] border-[#FF5722]'
                  : 'text-stone-400 border-transparent hover:text-stone-600',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── TAB: FOUR READS ─────────────────────────────────────────────── */}
        {tab === 'levels' && (
          <div className="space-y-6">
            <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400">
              Same game — Phillies @ Mets · Wheeler vs Manaea
            </p>

            {/* Level selector */}
            <div className="grid grid-cols-2 gap-2">
              {LEVELS.map((l, i) => (
                <LevelCard
                  key={l.num}
                  level={l}
                  active={activeLevel === i}
                  onClick={() => setActiveLevel(i)}
                />
              ))}
            </div>

            {/* Demo card — renders the selected level's view */}
            <div className="border border-[#1A1A1A] overflow-hidden">

              {/* Dark header */}
              <div className="bg-[#1A1A1A] px-5 py-4 flex items-start justify-between gap-4">
                <div>
                  <div className="font-mono text-[9px] uppercase tracking-widest text-stone-500 mb-1">
                    The Edge · {level.who}
                  </div>
                  <div className="font-serif text-xl font-bold text-[#FAF8F3]">
                    Phillies @ Mets
                  </div>
                  <div className="font-mono text-[9px] text-stone-500 mt-1">
                    Citi Field · 7:10 PM ET
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div
                    className="font-black leading-none text-[#FF5722]"
                    style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24 }}
                  >
                    3 out 8 Factors
                  </div>
                
                </div>
              </div>

              {/* Content area — changes by level */}
              <div className="bg-white px-5 py-5 space-y-4">

                {/* Label */}
                <div className="font-mono text-[9px] uppercase tracking-widest text-[#FF5722]">
                  {level.demo.label}
                </div>

                {/* Story text */}
                <p className={[
                  'font-serif leading-relaxed',
                  activeLevel === 3
                    ? 'text-[13px] text-stone-600'
                    : 'text-[15px] italic text-stone-900',
                ].join(' ')}>
                  {level.demo.text}
                </p>

                {/* Level 0: just the verdict — nothing else */}

                {/* Level 1+: show top factor */}
                {activeLevel >= 1 && (
                  <div className="flex items-center justify-between pt-3 border-t border-stone-100">
                    <span className="font-mono text-[10px] text-stone-400 uppercase tracking-wider">
                      Top factor
                    </span>
                    <span className="font-mono text-[11px] font-bold text-[#FF5722]">
                      Starting pitcher ↑↑   
                    </span>
                  </div>
                )}

                {/* Level 2+: show factor grid */}
                {activeLevel >= 2 && (
                  <div className="pt-1">
                    <div className="font-mono text-[9px] uppercase tracking-widest text-stone-400 mb-3">
                      All 8 factors
                    </div>
                    <div className="grid grid-cols-4 gap-px bg-stone-100 border border-stone-100">
                      {[
                        { name: 'Pitching', pos: true  },
                        { name: 'Bullpen',  pos: true  },
                        { name: 'Matchup',    pos: true  },
                        { name: 'Offense',   pos: true  },
                        { name: 'Defense',   pos: false },
                        { name: 'Park',      pos: true  },
                        { name: 'Weather',  pos: true  },
                        { name: 'Rest',      pos: false },
                      ].map(f => (
                        <div key={f.name} className="bg-white px-2 py-2.5 text-center">
                          <div
                            className="font-black text-[18px] leading-none mb-1"
                            style={{
                              fontFamily: "'Bebas Neue', sans-serif",
                              color: f.pos ? '#FF5722' : '#A3A3A3',
                            }}
                          >
                          
                          </div>
                          <div className="font-mono text-[8px] uppercase tracking-wide text-stone-400">
                            {f.name}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Level 3: show GM-specific extras */}
                {activeLevel === 3 && (
                  <div className="bg-[#1A1A1A] px-4 py-4 space-y-3">
                    <div className="font-mono text-[9px] uppercase tracking-widest text-[#FDE047]">
                      Bullpen availability
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                      {[
                        { name: 'Strahm',   status: 'B2B — unavailable', warn: true  },
                        { name: 'Hoffman',  status: '2 of 3 days',       warn: true  },
                        { name: 'Alvarado', status: 'Fresh',              warn: false },
                        { name: 'Kerkering',status: 'Fresh',              warn: false },
                      ].map(p => (
                        <div key={p.name} className="flex justify-between items-center">
                          <span className="font-mono text-[10px] text-stone-400">{p.name}</span>
                          <span className={[
                            'font-mono text-[10px] font-bold',
                            p.warn ? 'text-[#FF8A65]' : 'text-stone-500',
                          ].join(' ')}>
                            {p.status}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="pt-2 border-t border-stone-800">
                      <div className="font-mono text-[9px] uppercase tracking-widest text-stone-500 mb-1">
                        — Why we might be wrong
                      </div>
                      <p className="font-serif text-[12px] italic text-stone-400 leading-relaxed">
                        Manaea's K/9 has quietly jumped to 10.1 since May. If he locates the changeup, this gets close.
                      </p>
                    </div>
                  </div>
                )}

              </div>

              {/* Footer */}
              <div className="bg-[#FAF8F3] border-t border-stone-200 px-5 py-3 flex items-center justify-between">
                <span className="font-mono text-[9px] text-stone-400 uppercase tracking-widest">
                  {level.tier === 'Pro' ? '⊕ Pro feature' : 'Free · no sign-in needed'}
                </span>
                <Link
                  href="/mlb"
                  className="font-mono text-[9px] font-bold uppercase tracking-widest text-[#FF5722] hover:opacity-70 transition-opacity"
                >
                  Read tonight →
                </Link>
              </div>
            </div>

            {/* Upgrade nudge only shown for Pro levels */}
            {activeLevel >= 2 && (
              <div className="bg-[#1A1A1A] px-6 py-5 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1">
                  <div className="font-mono text-[9px] uppercase tracking-widest text-[#FF5722] mb-1">
                    ⊕ Pro — £6/mo · £50/yr
                  </div>
                  <p className="font-serif italic text-stone-300 text-sm leading-relaxed">
                    Unlock the full playbook for every game. First 100 founding members lock in £4/mo.
                  </p>
                </div>
                <Link
                  href="/pricing"
                  className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#1A1A1A] bg-[#FF5722] px-5 py-2.5 hover:bg-orange-600 transition shrink-0 text-center"
                >
                  Go Pro →
                </Link>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: VS GOOGLE AI ───────────────────────────────────────────── */}
        {tab === 'compare' && (
          <div className="space-y-6">
            <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400">
              Same query — &ldquo;Cubs vs Cardinals tonight&rdquo;
            </p>

            {/* Google card */}
            <div className="bg-white border border-stone-200 p-5">
              <div className="flex items-center gap-2.5 mb-3">
                <div
                  className="w-7 h-7 flex items-center justify-center text-white text-[13px] font-bold shrink-0"
                  style={{ background: 'linear-gradient(135deg,#4285F4,#34A853,#FBBC05,#EA4335)', borderRadius: '50%' }}
                >G</div>
                <div>
                  <p className="text-[12px] font-bold">AI Overview</p>
                  <p className="font-mono text-[9px] text-stone-400">google.com · generated answer</p>
                </div>
              </div>
              <p className="text-[14px] leading-relaxed text-stone-600">
                The Chicago Cubs face the St. Louis Cardinals tonight at Wrigley Field.
                Both teams have been competitive in recent weeks. The Cubs have shown
                strong offensive production, while the Cardinals bring solid pitching depth.
                This NL Central rivalry always delivers compelling baseball.
                First pitch is scheduled for 7:40&nbsp;PM&nbsp;CT.
              </p>
              <p className="font-mono text-[9px] text-stone-300 mt-3 pt-3 border-t border-stone-100">
                Based on publicly available sources · Not personalised
              </p>
            </div>

            {/* Edge card */}
            <div className="border border-stone-200 overflow-hidden">
              <div className="bg-[#1A1A1A] flex items-start justify-between p-5">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-widest text-stone-500 mb-1">The Edge · Tonight&apos;s brief</p>
                  <p className="font-serif text-xl font-black text-[#FAF8F3]">Cubs @ Cardinals</p>
                  <p className="font-mono text-[9px] text-stone-500 mt-1">Wrigley Field · 7:40 PM CT</p>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <p
                    className="font-black leading-none text-[#FF5722]"
                    style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 44 }}
                  >CHC</p>
                  <p className="font-mono text-[8px] uppercase tracking-widest text-[#FF5722] mt-1">Factor lean</p>
                </div>
              </div>
              <div className="bg-[#1A1A1A] px-5 pb-5">
                <p className="font-mono text-[9px] uppercase tracking-widest text-[#FF5722] font-bold mb-2">§ The Read</p>
                <p className="text-[13px] text-stone-300 leading-relaxed italic border-l-2 border-[#FF5722] pl-3">
                  &ldquo;Taillon&apos;s 1.98 ERA over his last four starts is the story —
                  Cardinals bullpen used 8.2 IP yesterday and the wind is blowing out at Wrigley.&rdquo;
                </p>
              </div>
              <div className="bg-white px-5 pt-4 pb-5">
                <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400 mb-3">Structural breakdown</p>
                {FACTORS.map(f => <FactorBar key={f.name} {...f} />)}
                <div className="flex justify-between items-center mt-3 pt-3 border-t border-stone-100">
                  <span className="font-mono text-[10px] font-bold text-[#FF5722]">CHC holds 4 of 6 factors</span>
                  <span className="font-mono text-[9px] text-stone-400">Archived for transparency</span>
                </div>
              </div>
            </div>

            {/* Gap table */}
            <div className="border border-stone-200 overflow-hidden bg-white">
              <div className="grid grid-cols-2">
                <div className="px-4 py-3 bg-[#FAF8F3] border-r border-stone-200 border-b">
                  <p className="font-mono text-[9px] uppercase tracking-widest text-stone-500 font-bold">AI Overview</p>
                </div>
                <div className="px-4 py-3 bg-orange-50 border-b border-orange-100">
                  <p className="font-mono text-[9px] uppercase tracking-widest text-[#FF5722] font-bold">The Edge</p>
                </div>
              </div>
              {GAPS.map((g, i) => (
                <div key={i} className={`grid grid-cols-2 ${i !== GAPS.length - 1 ? 'border-b border-stone-100' : ''}`}>
                  <div className="px-4 py-4 border-r border-stone-200">
                    <p className="text-[13px] leading-snug text-stone-400 font-serif">{g.them}</p>
                  </div>
                  <div className="px-4 py-4">
                    <p className="text-[13px] leading-snug text-stone-800 font-serif">{g.us}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-[#1A1A1A] p-6 text-center">
              <p className="font-serif font-black text-xl text-[#FAF8F3] italic">
                &ldquo;An AI summary tells you what happened.<br />
                The Edge tells you what matters.&rdquo;
              </p>
            </div>
          </div>
        )}

        {/* ── TAB: THE ARCHIVE ────────────────────────────────────────────── */}
        {tab === 'archive' && (
          <div className="space-y-6">
            <p className="text-lg text-stone-500 leading-relaxed font-serif italic">
              Every read. Logged daily. Factor lean vs final outcome — never deleted.
            </p>

            {/* Live stats */}
            <div className="grid grid-cols-2 gap-px bg-stone-200 border border-stone-200">
              <div className="bg-white px-4 py-5 text-center">
                <div
                  className="font-black text-[38px] leading-none text-[#1A1A1A] mb-1"
                  style={{ fontFamily: "'Bebas Neue', sans-serif" }}
                >
                  {stats.total_reviewed > 0 ? stats.total_reviewed : '—'}
                </div>
                <div className="font-mono text-[9px] uppercase tracking-widest text-[#FF5722] font-bold">
                  Reads recorded
                </div>
                {dateRange && (
                  <div className="font-mono text-[8px] text-stone-400 mt-1">{dateRange}</div>
                )}
              </div>
              
              <div className="bg-white px-4 py-5 text-center">
                <div
                  className="font-black text-[38px] leading-none text-[#1A1A1A] mb-1"
                  style={{ fontFamily: "'Bebas Neue', sans-serif" }}
                >
                  8
                </div>
                <div className="font-mono text-[9px] uppercase tracking-widest text-[#FF5722] font-bold">
                  Factors scored
                </div>
                <div className="font-mono text-[8px] text-stone-400 mt-1">
                  Per game, every game
                </div>
              </div>
            </div>

            {/* What we track */}
            <div className="bg-white border border-stone-200">
              <div className="px-5 py-3 border-b border-stone-100 bg-[#FAF8F3]">
                <span className="font-mono text-[9px] uppercase tracking-widest text-[#FF5722] font-bold">
                  § What we track
                </span>
              </div>
              {[
                { factor: 'Starting Pitcher', note: 'xFIP-adjusted · last 4 starts weighted' },
                { factor: 'Bullpen',          note: 'IP last 3 days · WPA/LI weighted'       },
                { factor: 'Offense',          note: 'wRC+ · xwOBA · Hard Hit% · ISO'         },
                { factor: 'Matchup',          note: 'Pitcher arsenal vs lineup vulnerability' },
                { factor: 'Park Factor',      note: 'HR factor · Run factor per venue'       },
                { factor: 'Weather',          note: 'Wind direction/speed · temp impact'     },
                { factor: 'Rest & Travel',    note: 'Days rest · back-to-back travel'        },
                { factor: 'Defense',          note: 'OAA · DRS composite'                   },
              ].map((row, i) => (
                <div
                  key={row.factor}
                  className={`flex items-center justify-between px-5 py-3 ${i < 7 ? 'border-b border-stone-100' : ''}`}
                >
                  <span className="font-serif text-[13px] font-semibold text-stone-900">{row.factor}</span>
                  <span className="font-mono text-[10px] text-stone-400">{row.note}</span>
                </div>
              ))}
            </div>

            {/* Transparency statement */}
            <div className="bg-white border border-stone-200 p-6">
              <p className="font-mono text-[9px] uppercase tracking-widest text-[#FF5722] font-bold mb-3">
                Why we show you this
              </p>
              <p className="text-[14px] leading-relaxed text-stone-600 font-serif">
                Most platforms hide behind vague language because there&apos;s no objective math underneath.
                We archive every factor lean alongside the final result. Not to claim accuracy —
                baseball is hard and the model will be wrong — but to give you the data to
                evaluate it yourself. Honesty is the product.
              </p>
            </div>

            <Link
              href="/track-record"
              className="block text-center font-mono text-[10px] font-bold uppercase tracking-widest text-[#FF5722] border border-[#FF5722] px-6 py-3 hover:bg-[#FF5722] hover:text-white transition"
            >
              View past previews→
            </Link>
          </div>
        )}

        <hr className="border-stone-200 my-12" />

        {/* CTA */}
        <div className="text-center pb-8 space-y-4">
          <p className="font-serif font-black text-3xl sm:text-4xl text-[#1A1A1A]">
            Free to read<span className="text-[#FF5722]">.</span> Pro for the full picture<span className="text-[#FF5722]">.</span>
          </p>
          <p className="font-mono text-[10px] text-stone-400 uppercase tracking-widest leading-relaxed">
            MLB daily · NFL from Sept 9 · Statistical analysis only
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Link
              href="/mlb"
              className="inline-block bg-[#FF5722] text-white px-8 py-3.5 font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-orange-600 transition"
            >
              Read tonight&apos;s brief →
            </Link>
            <Link
              href="/pricing"
              className="inline-block bg-white border border-stone-300 text-stone-700 px-8 py-3.5 font-mono text-[10px] uppercase tracking-widest hover:bg-stone-50 transition"
            >
              Go Pro · £6/mo →
            </Link>
          </div>
        </div>

      </div>
    </main>
  )
}