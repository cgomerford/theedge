// src/app/fantasy/wrap/WeeklyWrapBoard.tsx
//
// Four stacked sections, each a self-contained card so it screenshots
// cleanly on its own, plus a "Copy for Twitter" button per section that
// drops plain-text bullet copy on the clipboard. Not fully-formed tweets —
// raw material to edit before posting, same spirit as the rest of the app:
// nothing invented, just organized.
'use client'

import { useState } from 'react'
import Link from 'next/link'
import FantasySectionLabel from '@/components/fantasy/FantasySectionLabel'
import FantasyPickRow from '@/components/fantasy/FantasyPickRow'
import PlayerHeadshot from '@/components/fantasy/PlayerHeadshot'
import type { FantasyPick } from '@/lib/fantasy'
import type { OwnershipChange } from '@/lib/fantasy-ownership'
import type { MLBTransaction } from '@/lib/fantasy-transactions'
import type { WeeklyWrapData } from '@/lib/fantasy-wrap'

// ─── Copy-to-clipboard button ────────────────────────────────────────────────

function CopyButton({ text, label = 'Copy for Twitter' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard API can fail on non-HTTPS or without permission — fail
      // quietly rather than throwing an error at the user for a copy button.
    }
  }

  return (
    <button
      onClick={handleCopy}
      className={`font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 rounded-md border transition ${
        copied
          ? 'border-green-600 text-green-600 bg-green-50'
          : 'border-stone-300 text-stone-500 bg-white hover:border-[#FF5722] hover:text-[#FF5722]'
      }`}
    >
      {copied ? '✓ Copied' : label}
    </button>
  )
}

// ─── Tweet-text builders — plain bullets, nothing fabricated ────────────────

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`
}
function fmtDelta(n: number): string {
  const sign = n >= 0 ? '+' : ''
  return `${sign}${n.toFixed(1)}pp`
}

function buildOwnershipText(label: string, risers: OwnershipChange[], fallers: OwnershipChange[]): string {
  const lines = [`📊 Ownership movers — week of ${label}`, '']
  if (risers.length > 0) {
    lines.push('📈 Rostering up:')
    risers.forEach(r => lines.push(`• ${r.full_name} ${fmtDelta(r.delta)} → ${fmtPct(r.current)} owned`))
    lines.push('')
  }
  if (fallers.length > 0) {
    lines.push('📉 Rostering down:')
    fallers.forEach(f => lines.push(`• ${f.full_name} ${fmtDelta(f.delta)} → ${fmtPct(f.current)} owned`))
  }
  return lines.join('\n').trim()
}

function buildTrendingText(heating: FantasyPick[], cooling: FantasyPick[]): string {
  const lines: string[] = []
  if (heating.length > 0) {
    lines.push('🔥 Heating up:')
    heating.forEach(p => lines.push(`• ${p.player_name}${p.team_name ? ` (${p.team_name})` : ''} — ${p.one_liner}`))
    lines.push('')
  }
  if (cooling.length > 0) {
    lines.push('❄️ Cooling off:')
    cooling.forEach(p => lines.push(`• ${p.player_name}${p.team_name ? ` (${p.team_name})` : ''} — ${p.one_liner}`))
  }
  return lines.join('\n').trim()
}

function buildInjuryText(label: string, placed: MLBTransaction[], activated: MLBTransaction[]): string {
  const lines = [`🚑 IL report — week of ${label}`, '']
  if (placed.length > 0) {
    lines.push('Placed on IL:')
    placed.forEach(t => lines.push(`• ${t.description}`))
    lines.push('')
  }
  if (activated.length > 0) {
    lines.push('Activated:')
    activated.forEach(t => lines.push(`• ${t.description}`))
  }
  return lines.join('\n').trim()
}

function buildTransactionsText(
  label: string, trades: MLBTransaction[], dfaRelease: MLBTransaction[],
  recalled: MLBTransaction[], optioned: MLBTransaction[],
): string {
  const lines = [`🔁 Transactions — week of ${label}`, '']
  const block = (title: string, items: MLBTransaction[]) => {
    if (items.length === 0) return
    lines.push(`${title}:`)
    items.forEach(t => lines.push(`• ${t.description}`))
    lines.push('')
  }
  block('Trades', trades)
  block('DFA / Released', dfaRelease)
  block('Recalled', recalled)
  block('Optioned', optioned)
  return lines.join('\n').trim()
}

// ─── Small row components ────────────────────────────────────────────────────

function OwnershipRow({ change, direction }: { change: OwnershipChange; direction: 'up' | 'down' }) {
  const color = direction === 'up' ? 'text-green-600' : 'text-red-500'
  const arrow = direction === 'up' ? '▲' : '▼'
  const inner = (
    <div className="flex items-center gap-4 py-3 border-b border-stone-100 last:border-0">
      {change.mlb_player_id ? (
        <PlayerHeadshot playerId={change.mlb_player_id} size={80} className="w-10 h-10 rounded-full object-cover border border-stone-200 shrink-0" />
      ) : (
        <div className="w-10 h-10 rounded-full bg-stone-100 border border-stone-200 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <span className="font-serif font-semibold text-sm text-[#1A1A1A]">{change.full_name}</span>
        <div className="font-mono text-[10px] text-stone-400">
          {fmtPct(change.previous)} → {fmtPct(change.current)} owned
        </div>
      </div>
      <div className={`font-mono text-sm font-bold shrink-0 ${color}`}>
        {arrow} {fmtDelta(change.delta)}
      </div>
    </div>
  )
  return change.mlb_player_id ? (
    <Link href={`/fantasy/player/${change.mlb_player_id}?from=trending`} className="block hover:bg-stone-50 -mx-2 px-2 transition">
      {inner}
    </Link>
  ) : inner
}

function TransactionRow({ t }: { t: MLBTransaction }) {
  const inner = (
    <div className="flex items-start gap-3 py-3 border-b border-stone-100 last:border-0">
      {t.playerId ? (
        <PlayerHeadshot playerId={t.playerId} size={64} className="w-8 h-8 rounded-full object-cover border border-stone-200 shrink-0 mt-0.5" />
      ) : (
        <div className="w-8 h-8 rounded-full bg-stone-100 border border-stone-200 shrink-0 mt-0.5" />
      )}
      <div className="min-w-0 flex-1">
        <p className="font-serif text-sm text-stone-700 leading-snug">{t.description}</p>
        <div className="font-mono text-[9px] uppercase tracking-widest text-stone-300 mt-1">{t.date}</div>
      </div>
    </div>
  )
  return t.playerId ? (
    <Link href={`/fantasy/player/${t.playerId}?from=trending`} className="block hover:bg-stone-50 -mx-2 px-2 transition">
      {inner}
    </Link>
  ) : inner
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="font-serif italic text-sm text-stone-400 py-6 text-center">{children}</p>
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function WeeklyWrapBoard({ data }: { data: WeeklyWrapData }) {
  const { window: weekWindow, ownership, trending, transactions } = data

  const ownershipText = buildOwnershipText(weekWindow.label, ownership.risers, ownership.fallers)
  const trendingText = buildTrendingText(trending.heating, trending.cooling)
  const injuryText = buildInjuryText(weekWindow.label, transactions.ilPlaced, transactions.ilActivated)
  const transactionsText = buildTransactionsText(
    weekWindow.label, transactions.trades, transactions.dfaRelease, transactions.recalled, transactions.optioned,
  )
  const fullWrapText = [
    `⚾ THE EDGE — WEEKLY WRAP · ${weekWindow.label}`,
    '',
    ownershipText,
    '',
    '───',
    '',
    trendingText,
    '',
    '───',
    '',
    injuryText,
    '',
    '───',
    '',
    transactionsText,
  ].filter(Boolean).join('\n')

  const hasOwnership = ownership.risers.length > 0 || ownership.fallers.length > 0
  const hasTrending = trending.heating.length > 0 || trending.cooling.length > 0
  const hasInjuries = transactions.ilPlaced.length > 0 || transactions.ilActivated.length > 0
  const hasTransactions = transactions.trades.length > 0 || transactions.dfaRelease.length > 0
    || transactions.recalled.length > 0 || transactions.optioned.length > 0

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 pb-16">

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="py-6 border-b border-stone-900 mb-8">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-[#7C3AED] font-bold mb-1">
              ⊕ Weekly Wrap
            </div>
            <h1 className="font-serif text-3xl md:text-4xl font-bold tracking-tight leading-none">
              The week in review<span className="text-[#FF5722]">.</span>
            </h1>
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              <span className="font-mono text-[10px] uppercase tracking-widest text-stone-400">
                Week of {weekWindow.label}
              </span>
              {weekWindow.isCurrentWeek && (
                <span className="font-mono text-[10px] uppercase tracking-widest text-amber-600">
                  In progress — updates as the week goes
                </span>
              )}
              <Link
                href={weekWindow.isCurrentWeek ? '/fantasy/wrap?week=last' : '/fantasy/wrap'}
                className="font-mono text-[10px] uppercase tracking-widest text-orange-600 hover:underline"
              >
                {weekWindow.isCurrentWeek ? 'View last week →' : '← Back to this week'}
              </Link>
            </div>
          </div>
          <CopyButton text={fullWrapText} label="Copy full wrap" />
        </div>
        <p className="font-serif italic text-sm text-stone-500 mt-4 max-w-2xl leading-relaxed">
          Ownership movers, model trend signals, the IL report, and the full transaction log for the week —
          built to scroll, screenshot, or copy straight into a tweet.
        </p>
      </div>

      {/* ── Ownership movers ─────────────────────────────────────────── */}
      <section className="mb-12">
        <div className="flex items-center justify-between gap-4 mb-1">
          <FantasySectionLabel accent="#2563EB">Ownership movers</FantasySectionLabel>
        </div>
        <div className="flex items-center justify-between gap-4 mb-4">
          <p className="font-serif italic text-sm text-stone-500 max-w-xl leading-relaxed">
            Real ESPN roster-percentage change over the calendar week — this is what managers are
            actually doing, independent of any model.
          </p>
          {hasOwnership && <CopyButton text={ownershipText} />}
        </div>
        {!hasOwnership ? (
          <div className="border border-dashed border-stone-300 bg-stone-50 rounded-lg px-4 py-6 text-center">
            <EmptyNote>No significant ownership moves this week yet.</EmptyNote>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white border border-stone-200 rounded-lg px-4">
              <div className="py-2 border-b border-stone-200 font-mono text-[10px] uppercase tracking-widest text-green-600 font-bold">
                Rostering up
              </div>
              {ownership.risers.length === 0
                ? <EmptyNote>No significant moves.</EmptyNote>
                : ownership.risers.map(c => <OwnershipRow key={c.espn_player_id} change={c} direction="up" />)}
            </div>
            <div className="bg-white border border-stone-200 rounded-lg px-4">
              <div className="py-2 border-b border-stone-200 font-mono text-[10px] uppercase tracking-widest text-red-500 font-bold">
                Rostering down
              </div>
              {ownership.fallers.length === 0
                ? <EmptyNote>No significant moves.</EmptyNote>
                : ownership.fallers.map(c => <OwnershipRow key={c.espn_player_id} change={c} direction="down" />)}
            </div>
          </div>
        )}
      </section>

      {/* ── Trending ──────────────────────────────────────────────────── */}
      <section className="mb-12">
        <div className="flex items-center justify-between gap-4 mb-4">
          <FantasySectionLabel accent="#059669">Trending this week</FantasySectionLabel>
          {hasTrending && <CopyButton text={trendingText} />}
        </div>
        {!hasTrending ? (
          <div className="border border-dashed border-stone-300 bg-stone-50 rounded-lg px-4 py-6 text-center">
            <EmptyNote>Nobody heating up or cooling off enough to flag right now.</EmptyNote>
          </div>
        ) : (
          <>
            <div className="bg-white border border-stone-200 rounded-lg px-4 mb-6">
              <div className="py-2 border-b border-stone-200 font-mono text-[10px] uppercase tracking-widest text-green-600 font-bold">
                Heating up
              </div>
              {trending.heating.length === 0
                ? <EmptyNote>Nobody heating up enough to flag.</EmptyNote>
                : trending.heating.map(p => (
                    <FantasyPickRow key={p.id} pick={p} ownership={null} linkTo="player" fromBoard="trending" />
                  ))}
            </div>
            <div className="bg-white border border-stone-200 rounded-lg px-4">
              <div className="py-2 border-b border-stone-200 font-mono text-[10px] uppercase tracking-widest text-red-500 font-bold">
                Cooling off
              </div>
              {trending.cooling.length === 0
                ? <EmptyNote>Nobody cooling off enough to flag.</EmptyNote>
                : trending.cooling.map(p => (
                    <FantasyPickRow key={p.id} pick={p} ownership={null} linkTo="player" fromBoard="trending" />
                  ))}
            </div>
          </>
        )}
      </section>

      {/* ── IL report ─────────────────────────────────────────────────── */}
      <section className="mb-12">
        <div className="flex items-center justify-between gap-4 mb-4">
          <FantasySectionLabel accent="#DC2626">IL report</FantasySectionLabel>
          {hasInjuries && <CopyButton text={injuryText} />}
        </div>
        {!hasInjuries ? (
          <div className="border border-dashed border-stone-300 bg-stone-50 rounded-lg px-4 py-6 text-center">
            <EmptyNote>No IL moves recorded this week.</EmptyNote>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white border border-stone-200 rounded-lg px-4">
              <div className="py-2 border-b border-stone-200 font-mono text-[10px] uppercase tracking-widest text-red-500 font-bold">
                Placed on IL
              </div>
              {transactions.ilPlaced.length === 0
                ? <EmptyNote>None this week.</EmptyNote>
                : transactions.ilPlaced.map(t => <TransactionRow key={t.id} t={t} />)}
            </div>
            <div className="bg-white border border-stone-200 rounded-lg px-4">
              <div className="py-2 border-b border-stone-200 font-mono text-[10px] uppercase tracking-widest text-green-600 font-bold">
                Activated
              </div>
              {transactions.ilActivated.length === 0
                ? <EmptyNote>None this week.</EmptyNote>
                : transactions.ilActivated.map(t => <TransactionRow key={t.id} t={t} />)}
            </div>
          </div>
        )}
      </section>

      {/* ── Transactions ──────────────────────────────────────────────── */}
      <section className="mb-8">
        <div className="flex items-center justify-between gap-4 mb-4">
          <FantasySectionLabel accent="#7C3AED">Transactions</FantasySectionLabel>
          {hasTransactions && <CopyButton text={transactionsText} />}
        </div>
        {!hasTransactions ? (
          <div className="border border-dashed border-stone-300 bg-stone-50 rounded-lg px-4 py-6 text-center">
            <EmptyNote>No trades, DFAs, releases, recalls, or options recorded this week.</EmptyNote>
          </div>
        ) : (
          <div className="space-y-6">
            {transactions.trades.length > 0 && (
              <div className="bg-white border border-stone-200 rounded-lg px-4">
                <div className="py-2 border-b border-stone-200 font-mono text-[10px] uppercase tracking-widest text-stone-600 font-bold">
                  Trades
                </div>
                {transactions.trades.map(t => <TransactionRow key={t.id} t={t} />)}
              </div>
            )}
            {transactions.dfaRelease.length > 0 && (
              <div className="bg-white border border-stone-200 rounded-lg px-4">
                <div className="py-2 border-b border-stone-200 font-mono text-[10px] uppercase tracking-widest text-stone-600 font-bold">
                  DFA / Released
                </div>
                {transactions.dfaRelease.map(t => <TransactionRow key={t.id} t={t} />)}
              </div>
            )}
            {transactions.recalled.length > 0 && (
              <div className="bg-white border border-stone-200 rounded-lg px-4">
                <div className="py-2 border-b border-stone-200 font-mono text-[10px] uppercase tracking-widest text-stone-600 font-bold">
                  Recalled
                </div>
                {transactions.recalled.map(t => <TransactionRow key={t.id} t={t} />)}
              </div>
            )}
            {transactions.optioned.length > 0 && (
              <div className="bg-white border border-stone-200 rounded-lg px-4">
                <div className="py-2 border-b border-stone-200 font-mono text-[10px] uppercase tracking-widest text-stone-600 font-bold">
                  Optioned
                </div>
                {transactions.optioned.map(t => <TransactionRow key={t.id} t={t} />)}
              </div>
            )}
          </div>
        )}
      </section>

      <div className="pt-6 border-t border-stone-200">
        <p className="font-mono text-[10px] uppercase tracking-widest text-stone-300">
          Ownership from ESPN · Transactions and IL data from MLB Stats API · Information only
        </p>
      </div>
    </div>
  )
}
