'use client'

import { useState } from 'react'
import Link from 'next/link'

// ─── Data ─────────────────────────────────────────────────────────────────────

const FACTORS = [
  { name: 'Starting Pitcher', score: 62,  label: 'CHC ↑↑' },
  { name: 'Bullpen',          score: -28, label: 'STL ↑'  },
  { name: 'Offensive Form',   score: 18,  label: 'CHC ↑'  },
  { name: 'Matchup',          score: 3,   label: 'EVEN'   },
  { name: 'Park Factor',      score: 12,  label: 'CHC ↑'  },
  { name: 'Rest & Travel',    score: -2,  label: 'EVEN'   },
]

const GAPS = [
  { them: 'Instant answer, no model',           us: '8-factor rule-based model with public weights'                },
  { them: 'No history, no accountability',       us: 'Public track record — graded daily, never deleted'          },
  { them: '"Both teams have been competitive"',  us: '"Taillon 1.98 ERA L4 + Cardinals pen used 8.2 IP yesterday"'},
  { them: 'One paragraph and done',              us: 'Daily email + Dugout dashboard + team follows'               },
  { them: 'No fantasy utility',                  us: 'Pro: Bullpen Status, Start/Sit, Hot Zones'                   },
  { them: 'Same answer for everyone',            us: 'Personalised to your teams and league'                       },
]

const CALLS = [
  { matchup: 'PHI @ NYM', score: 52,  note: 'Wheeler 1.82 ERA L3',            aligned: true  },
  { matchup: 'HOU @ SEA', score: -34, note: 'Logan Gilbert CSW 32%',           aligned: true  },
  { matchup: 'CHC @ MIL', score: 28,  note: 'Cubs bullpen surprise',            aligned: false },
  { matchup: 'LAD @ SF',  score: 61,  note: 'Kershaw return + 6 of 8 factors', aligned: true  },
]

// ─── Factor bar ───────────────────────────────────────────────────────────────

function FactorBar({ name, score, label }: { name: string; score: number; label: string }) {
  const abs    = Math.abs(score)
  const isEven = abs <= 5
  const isHome = score > 0
  const color  = isEven ? '#9CA3AF' : isHome ? '#FF5722' : '#3B82F6'
  const pct    = Math.min(100, (abs / 70) * 100)

  return (
    <div className="flex items-center gap-3 py-1.5 border-b border-stone-100 last:border-0">
      <span className="font-mono text-[10px] uppercase tracking-wide text-stone-400 w-32 shrink-0">
        {name}
      </span>
      <div className="flex-1 h-[3px] bg-stone-200 rounded-full overflow-hidden relative">
        <div
          className="absolute h-full rounded-full"
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

// ─── Main ─────────────────────────────────────────────────────────────────────

type Tab = 'compare' | 'gaps' | 'track'

export default function WhyEdgeClient() {
  const [tab, setTab] = useState<Tab>('compare')

  return (
    <main className="min-h-screen bg-[#FAF8F3]">
      <div className="max-w-2xl mx-auto px-6 sm:px-8 py-10 sm:py-14">

        {/* ── Back link ── */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-[#FF5722] mb-8 hover:opacity-70 transition-opacity"
        >
          ← Back to home
        </Link>

        {/* ── Page title ── */}
        <h1
          className="text-5xl sm:text-6xl font-black tracking-tight leading-[1.05] mb-6"
          style={{ fontFamily: 'Fraunces, serif' }}
        >
          Why The Edge.
        </h1>

        <p className="text-lg sm:text-xl text-stone-600 leading-relaxed mb-10">
          Google&apos;s AI Mode will tell you who&apos;s starting tonight and when first pitch is.
          That&apos;s useful. It&apos;s not what we do.
        </p>

        <hr className="border-stone-200 mb-10" />

        {/* ── Tabs ── */}
        <div className="flex border-b-2 border-[#1A1A1A] mb-8 -mx-1">
          {([
            ['compare', 'Side by side'],
            ['gaps',    "What's missing"],
            ['track',   'Track record'],
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

        {/* ── Tab: Compare ── */}
        {tab === 'compare' && (
          <div className="space-y-6">
            <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400">
              Same query — &ldquo;Cubs vs Cardinals tonight&rdquo;
            </p>

            {/* Google card */}
            <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2.5 mb-3">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[13px] font-bold shrink-0"
                  style={{ background: 'linear-gradient(135deg,#4285F4,#34A853,#FBBC05,#EA4335)' }}
                >G</div>
                <div>
                  <p className="text-[12px] font-bold">AI Overview</p>
                  <p className="font-mono text-[9px] text-stone-400">google.com · generated answer</p>
                </div>
              </div>
              <p className="text-[14px] leading-relaxed text-[#3C4043]">
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

            {/* The Edge card */}
            <div className="bg-[#1A1A1A] rounded overflow-hidden">
              <div className="flex items-start justify-between p-4 sm:p-5 border-b border-white/10">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-widest text-stone-500 mb-1">The Edge · Today&apos;s brief</p>
                  <p className="font-black text-xl text-[#FAF8F3]" style={{ fontFamily: 'Fraunces, serif' }}>
                    Cubs @ Cardinals
                  </p>
                  <p className="font-mono text-[9px] text-stone-600 mt-1">Wrigley Field · 7:40 PM CT</p>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <p className="font-black text-[44px] text-[#FF5722] leading-none" style={{ fontFamily: 'Fraunces, serif' }}>34</p>
                  <p className="font-mono text-[8px] uppercase tracking-widest text-[#FF5722] mt-1">CHC Edge</p>
                </div>
              </div>

              <div className="px-4 sm:px-5 py-3 border-b border-white/10">
                <p className="font-mono text-[9px] uppercase tracking-widest text-[#FF5722] font-bold mb-1.5">§ The Read</p>
                <p className="text-[13px] text-stone-400 leading-relaxed italic">
                  &ldquo;Taillon&apos;s 1.98 ERA over his last four starts is the story —
                  Cardinals bullpen used 8.2 IP yesterday and the wind is blowing out at Wrigley.&rdquo;
                </p>
              </div>

              <div className="bg-[#FAF8F3] px-4 sm:px-5 pt-4 pb-5">
                <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400 mb-3">Matchup Tilt</p>
                {FACTORS.map(f => <FactorBar key={f.name} {...f} />)}
                <div className="flex justify-between items-center mt-3 pt-3 border-t border-stone-200">
                  <span className="font-mono text-[10px] font-bold text-[#FF5722]">CHC holds 4 of 6 factors</span>
                  <span className="font-mono text-[9px] text-stone-400">61% alignment · 218 games</span>
                </div>
              </div>
            </div>

            <div className="p-5 bg-[#1A1A1A] rounded text-center">
              <p className="font-black text-xl text-[#FAF8F3] italic" style={{ fontFamily: 'Fraunces, serif' }}>
                &ldquo;An AI summary tells you what happened.<br />
                The Edge tells you what matters.&rdquo;
              </p>
            </div>
          </div>
        )}

        {/* ── Tab: Gaps ── */}
        {tab === 'gaps' && (
          <div className="space-y-6">
            <p className="text-lg text-stone-600 leading-relaxed">
              Google&apos;s AI Mode is impressive. It&apos;s just not built for this.
            </p>

            {/* Table */}
            <div className="overflow-hidden border border-stone-200 rounded">
              {/* Header */}
              <div className="grid grid-cols-2">
                <div className="px-4 py-2.5 bg-stone-100 border-r border-stone-200">
                  <p className="font-mono text-[9px] uppercase tracking-widest text-stone-500 font-bold">AI Overview</p>
                </div>
                <div className="px-4 py-2.5 bg-[#FF5722]/10">
                  <p className="font-mono text-[9px] uppercase tracking-widest text-[#FF5722] font-bold">The Edge</p>
                </div>
              </div>
              {/* Rows */}
              {GAPS.map((g, i) => (
                <div key={i} className={`grid grid-cols-2 border-t border-stone-200 ${i % 2 === 0 ? 'bg-white' : 'bg-[#FAF8F3]'}`}>
                  <div className="px-4 py-4 border-r border-stone-200">
                    <p className="text-[13px] leading-snug text-stone-500">{g.them}</p>
                  </div>
                  <div className="px-4 py-4">
                    <p className="text-[13px] leading-snug font-medium text-[#1A1A1A]">{g.us}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-5 bg-[#1A1A1A] rounded text-center">
              <p className="font-black text-xl text-[#FAF8F3] italic" style={{ fontFamily: 'Fraunces, serif' }}>
                &ldquo;An AI summary tells you what happened.<br />
                The Edge tells you what matters.&rdquo;
              </p>
            </div>
          </div>
        )}

        {/* ── Tab: Track record ── */}
        {tab === 'track' && (
          <div className="space-y-6">
            <p className="text-lg text-stone-600 leading-relaxed">
              Every call. Graded daily. Never deleted.
              We call it factor alignment, not accuracy.
            </p>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { val: '61%',    lbl: 'Alignment rate', sub: '218 graded games' },
                { val: '68%',    lbl: 'Strong calls',   sub: 'score ≥ 40'       },
                { val: '4 of 8', lbl: 'Avg factors',    sub: 'per game'         },
              ].map(s => (
                <div key={s.val} className="bg-[#1A1A1A] p-4 text-center">
                  <p className="font-black text-3xl text-[#FF5722] leading-none" style={{ fontFamily: 'Fraunces, serif' }}>
                    {s.val}
                  </p>
                  <p className="font-mono text-[9px] uppercase tracking-wide text-[#FAF8F3] mt-2 leading-snug">{s.lbl}</p>
                  <p className="font-mono text-[8px] text-stone-500 mt-1">{s.sub}</p>
                </div>
              ))}
            </div>

            {/* Recent calls */}
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400 mb-3">Recent calls</p>
              <div className="border border-stone-200 rounded overflow-hidden">
                {CALLS.map((c, i) => (
                  <div
                    key={i}
                    className={`flex items-center px-4 py-3.5 border-b border-stone-100 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-[#FAF8F3]'}`}
                  >
                    <div className="flex-1 min-w-0 mr-4">
                      <p className="font-mono text-[11px] font-bold">{c.matchup}</p>
                      <p className="font-mono text-[10px] text-stone-400 mt-0.5">{c.note}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p
                        className="font-black text-[18px] leading-none"
                        style={{ fontFamily: 'Fraunces, serif', color: c.score > 0 ? '#FF5722' : '#3B82F6' }}
                      >
                        {c.score > 0 ? '+' : ''}{c.score}
                      </p>
                      <p className={`font-mono text-[9px] font-bold mt-0.5 ${c.aligned ? 'text-green-500' : 'text-red-400'}`}>
                        {c.aligned ? '✓ aligned' : '✗ upset'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-5 border border-stone-200 bg-white rounded">
              <p className="font-mono text-[9px] uppercase tracking-widest text-[#FF5722] font-bold mb-2">Why we show you this</p>
              <p className="text-[14px] leading-relaxed text-stone-600">
                Most sports AI hides behind vague language because it has no model and no history.
                We show every call — including the upsets — because that&apos;s the only honest way to build trust.
              </p>
            </div>
          </div>
        )}

        <hr className="border-stone-200 my-10" />

        {/* ── CTA ── */}
        <div className="text-center">
          <p className="font-black text-3xl text-[#1A1A1A] mb-2" style={{ fontFamily: 'Fraunces, serif' }}>
            Free to read. Pro to win.
          </p>
          <p className="font-mono text-[11px] text-stone-400 mb-6 leading-relaxed">
            Daily MLB brief · Public track record · No picks, no gambling
          </p>
          <Link
            href="/mlb"
            className="inline-block bg-[#FF5722] text-white px-8 py-3 font-mono text-[11px] font-bold uppercase tracking-widest hover:bg-[#E64E1E] transition-colors"
          >
            Read tonight&apos;s brief →
          </Link>
        </div>

      </div>
    </main>
  )
}