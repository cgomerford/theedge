// src/app/track-record/page.tsx
//
// PUBLIC FACTOR ALIGNMENT PAGE
//
// Shows how often game outcomes match the factor lean — NOT "prediction accuracy."
// Every word on this page has been chosen to avoid betting/tipping language.
//
// Banned words: prediction, accuracy, correct, incorrect, pick, bet, lock, odds.
// Preferred: factor, alignment, lean, outcome, matched, reviewed, observed.

import { Metadata } from 'next'
import Link from 'next/link'
import {
  getOverallStats,
  getFactorBracketStats,
  getLeadingFactorStats,
  getRecentReads,
} from '@/lib/track-record'
import SiteHeader from '@/components/SiteHeader'


export const revalidate = 1800

export const metadata: Metadata = {
  title: 'Factor Alignment · The Edge',
  description:
    'Public record of how The Edge\'s 8-factor model aligns with game outcomes. Transparent, auto-reviewed, information only.',
}

export default async function TrackRecordPage() {
  const [overall, brackets, leaders, recent] = await Promise.all([
    getOverallStats(),
    getFactorBracketStats(),
    getLeadingFactorStats(),
    getRecentReads(20),
  ])

  return (
    <main className="min-h-screen bg-[#FAF8F3]">
      <SiteHeader />
    

      <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
        {/* ════════════════════════════════════════════════
            HERO
            ════════════════════════════════════════════════ */}
        <header className="mb-12">
          <div className="text-[#FF5722] text-xs font-mono uppercase tracking-wider mb-2">
            — Factor alignment · public record
          </div>
          <h1
            className="text-4xl md:text-5xl font-bold text-[#1A1A1A] mb-4"
            style={{ fontFamily: 'Fraunces, serif' }}
          >
            Where the factors pointed{' '}
            <em className="text-[#FF5722]">— and what happened.</em>
          </h1>
          <p className="text-base md:text-lg text-[#4A4A4A] leading-relaxed max-w-2xl">
            Every game, 8 factors lean one way or another. We log them all, then
            check whether the outcome followed. No cherry-picking, no hiding
            misses. Information only.
          </p>
        </header>

        {/* ════════════════════════════════════════════════
            OVERALL ALIGNMENT
            ════════════════════════════════════════════════ */}
        <section className="bg-[#1A1A1A] rounded-lg p-6 md:p-8 mb-8 text-[#FAF8F3]">
          <div className="text-[#FF5722] text-xs font-mono uppercase tracking-wider mb-4">
            ⊕ Overall factor alignment
          </div>

          {overall.insufficient_sample ? (
            <div>
              <div
                className="text-2xl md:text-3xl font-bold mb-3"
                style={{ fontFamily: 'Fraunces, serif' }}
              >
                Building the record — too early to publish
              </div>
              <p className="text-[#FAF8F3]/80 leading-relaxed mb-4">
                We&apos;re logging every game and reviewing outcomes as results
                come in. So far:{' '}
                <strong>{overall.total_reviewed} games reviewed</strong>
                {overall.date_range_start &&
                  ` since ${formatDate(overall.date_range_start)}`}
                . We need at least {100} before publishing alignment rates —
                small samples mislead.
              </p>
              <p className="text-[#FAF8F3]/60 text-sm">
                Check back as the sample grows. The factors are being logged
                right now, and every game will be reviewed.
              </p>
            </div>
          ) : (
            <div>
              <div
                className="text-4xl md:text-5xl font-bold mb-2"
                style={{ fontFamily: 'Fraunces, serif' }}
              >
                {overall.alignment_percent?.toFixed(1)}%{' '}
                <span className="text-lg md:text-xl font-normal text-[#FAF8F3]/60">
                  alignment
                </span>
              </div>
              <p className="text-[#FAF8F3]/80 leading-relaxed">
                When the majority of 8 factors lean one way, the outcome has
                matched{' '}
                <strong>
                  {overall.alignment_percent?.toFixed(1)}% of the time
                </strong>{' '}
                across {overall.total_reviewed} reviewed games
                {overall.date_range_start &&
                  ` (${formatDate(overall.date_range_start)} – ${formatDate(overall.date_range_end!)})`}
                .
              </p>
            </div>
          )}
        </section>

        {/* ════════════════════════════════════════════════
            FACTOR BRACKET BREAKDOWN
            ════════════════════════════════════════════════ */}
        <section className="mb-8">
          <div className="text-[#FF5722] text-xs font-mono uppercase tracking-wider mb-4">
            § Factor count vs outcome
          </div>
          <p
            className="text-sm text-[#4A4A4A] mb-6 max-w-xl"
            style={{ fontFamily: 'Fraunces, serif' }}
          >
            The more factors that agree, the more often the outcome follows. Here&apos;s
            the breakdown by how many of 8 factors leaned the same way.
          </p>

          <div className="space-y-3">
            {brackets.map((b) => (
              <div
                key={b.label}
                className="bg-white border border-[#E7E1D6] rounded-lg p-5"
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className="font-mono text-xs uppercase tracking-wider text-[#1A1A1A]"
                    style={{ letterSpacing: '0.08em' }}
                  >
                    {b.label}
                  </span>
                  <span className="font-mono text-xs text-[#A3A3A3]">
                    {b.games} games
                  </span>
                </div>

                {/* Alignment bar */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-3 bg-[#F0EDE6] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${b.alignment_percent ?? 0}%`,
                        background:
                          b.min_factors >= 7
                            ? '#FF5722'
                            : b.min_factors >= 5
                              ? '#FDE047'
                              : '#A3A3A3',
                      }}
                    />
                  </div>
                  <span
                    className="font-mono text-sm font-bold min-w-[48px] text-right"
                    style={{
                      color:
                        b.min_factors >= 7
                          ? '#FF5722'
                          : b.min_factors >= 5
                            ? '#8a6d00'
                            : '#777',
                    }}
                  >
                    {b.alignment_percent !== null
                      ? `${b.alignment_percent.toFixed(0)}%`
                      : '—'}
                  </span>
                </div>

                <div className="mt-2 font-mono text-[10px] text-[#A3A3A3]">
                  Outcome matched in {b.matched} of {b.games} reviewed games
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ════════════════════════════════════════════════
            LEADING FACTOR
            ════════════════════════════════════════════════ */}
        {leaders.length > 0 && (
          <section className="mb-8">
            <div className="text-[#FF5722] text-xs font-mono uppercase tracking-wider mb-4">
              § When each factor led the read
            </div>
            <p
              className="text-sm text-[#4A4A4A] mb-6 max-w-xl"
              style={{ fontFamily: 'Fraunces, serif' }}
            >
              Which factor had the highest magnitude in a given game — and when
              it led, how often did the outcome follow?
            </p>

            <div className="bg-white border border-[#E7E1D6] rounded-lg overflow-hidden">
              {leaders.map((f, i) => (
                <div
                  key={f.factor_key}
                  className={`flex items-center justify-between px-5 py-4 ${
                    i < leaders.length - 1 ? 'border-b border-[#F0EDE6]' : ''
                  }`}
                >
                  <div>
                    <span className="font-mono text-xs font-bold text-[#1A1A1A] uppercase tracking-wider">
                      {f.factor_label}
                    </span>
                    <span className="font-mono text-[10px] text-[#A3A3A3] ml-2">
                      led in {f.games_led} games
                    </span>
                  </div>
                  <span
                    className="font-mono text-sm font-bold"
                    style={{
                      color:
                        (f.alignment_percent ?? 0) >= 65
                          ? '#FF5722'
                          : (f.alignment_percent ?? 0) >= 55
                            ? '#8a6d00'
                            : '#777',
                    }}
                  >
                    {f.alignment_percent !== null
                      ? `${f.alignment_percent.toFixed(0)}%`
                      : '—'}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ════════════════════════════════════════════════
            RECENT READS
            ════════════════════════════════════════════════ */}
        {recent.length > 0 && (
          <section className="mb-8">
            <div className="text-[#FF5722] text-xs font-mono uppercase tracking-wider mb-4">
              § Recent games reviewed
            </div>

            <div className="bg-white border border-[#E7E1D6] rounded-lg overflow-hidden">
              {recent.map((r, i) => {
                const leanTeam =
                  r.factor_lean === 'home'
                    ? r.home_team
                    : r.factor_lean === 'away'
                      ? r.away_team
                      : null
                const winnerTeam =
                  r.actual_winner === 'home' ? r.home_team : r.away_team

                return (
                  <div
                    key={`${r.game_pk}-${i}`}
                    className={`px-5 py-4 ${
                      i < recent.length - 1 ? 'border-b border-[#F0EDE6]' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      {/* Teams + date */}
                      <div>
                        <span className="text-sm font-bold text-[#1A1A1A]">
                          {r.away_team} @ {r.home_team}
                        </span>
                        <span className="font-mono text-[10px] text-[#A3A3A3] ml-2">
                          {formatDate(r.game_date)}
                        </span>
                      </div>

                      {/* Score */}
                      {r.away_score != null && r.home_score != null && (
                        <span className="font-mono text-xs text-[#A3A3A3]">
                          {r.away_score}–{r.home_score}
                        </span>
                      )}
                    </div>

                    {/* Factor lean + outcome */}
                    <div className="mt-1 font-mono text-[11px]">
                      {r.factor_lean === 'split' ? (
                        <span className="text-[#A3A3A3]">
                          Factors split · {winnerTeam} won
                        </span>
                      ) : (
                        <span>
                          <span className="text-[#1A1A1A]">
                            {r.lean_factors} of 8 factors → {leanTeam}
                          </span>
                          <span className="mx-1 text-[#A3A3A3]">·</span>
                          <span
                            style={{
                              color: r.outcome_matched
                                ? '#2E7D52'
                                : '#B0A99A',
                            }}
                          >
                            {r.outcome_matched
                              ? `${winnerTeam} won ✓`
                              : `${winnerTeam} won`}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* ════════════════════════════════════════════════
            METHODOLOGY
            ════════════════════════════════════════════════ */}
        <section className="bg-white border border-[#E7E1D6] rounded-lg p-6 md:p-8 mb-8">
          <div className="text-[#FF5722] text-xs font-mono uppercase tracking-wider mb-4">
            § How this works
          </div>
          <div
            className="space-y-3 text-sm text-[#4A4A4A] leading-relaxed"
            style={{ fontFamily: 'Fraunces, serif' }}
          >
            <p>
              <strong>8 factors, every game.</strong> Starting pitching, bullpen,
              offensive form, pitch matchups, park factor, weather, defense, and
              rest/travel. Each is scored independently — positive means the home
              side has the edge in that factor, negative means the away side
              does.
            </p>
            <p>
              <strong>A factor &ldquo;leans&rdquo; when it crosses ±5.</strong>{' '}
              Below that threshold, the factor is too close to call and counts as
              neutral. Above it, the factor favours one side. We count how many
              of 8 factors lean the same direction — that&apos;s the &ldquo;factor
              count.&rdquo;
            </p>
            <p>
              <strong>Auto-reviewed.</strong> Each morning, yesterday&apos;s results are
              pulled from the MLB Stats API and compared to the factor lean.
              Nothing is hand-picked or edited after the fact.
            </p>
            <p>
              <strong>What this is not.</strong> This is not a tipping record and
              not a measure of betting performance. Factors describe the
              analytical landscape of a game — they don&apos;t account for run lines,
              totals, or market prices. This page exists for one reason:
              transparency.
            </p>
            <p className="text-xs italic pt-2">
              Open any game preview and tap &ldquo;See the factors&rdquo; to see
              how each component is scored.
            </p>
          </div>
        </section>

        {/* ════════════════════════════════════════════════
            FOOTER LINK
            ════════════════════════════════════════════════ */}
        <div className="text-center pb-12">
          <Link
            href="/"
            className="text-sm font-mono uppercase tracking-wider text-[#FF5722] hover:underline"
          >
            ← Back to today&apos;s games
          </Link>
        </div>
      </div>
    </main>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}