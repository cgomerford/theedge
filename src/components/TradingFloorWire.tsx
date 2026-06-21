// src/components/TradingFloorWire.tsx
//
// Compact "Wire" panel for the Trading Floor — same data sources already
// proven in /fantasy (FantasyDashboard.tsx): news, IL placements, and
// transactions. This component does NOT fetch its own data; it receives
// pre-fetched props from the Trading Floor page, exactly like
// FantasyDashboard does, so there's a single fetch per page load rather
// than each panel fetching independently.
//
// Visual language (badges, colors) intentionally matches
// FantasyDashboard.tsx's txBadge / newsCategoryStyle / ilBadgeStyle so the
// Trading Floor and the Fantasy Desk don't feel like two different products.

import type { NewsItem } from '@/lib/fantasy-news'
import type { TeamTransaction } from '@/lib/team-transactions'

interface TradingFloorWireProps {
  news: NewsItem[]
  ilList: TeamTransaction[]
  transactions: TeamTransaction[]
  maxItems?: number
}

// ── Style helpers (mirrors FantasyDashboard.tsx) ────────────────────────────

function newsCategoryStyle(category: NewsItem['category']): { dot: string; bg: string; color: string } {
  switch (category) {
    case 'injury':      return { dot: '#DC2626', bg: 'rgba(220,38,38,0.10)', color: '#DC2626' }
    case 'lineup':      return { dot: '#D97706', bg: 'rgba(217,119,6,0.10)', color: '#D97706' }
    case 'transaction': return { dot: '#2563EB', bg: 'rgba(37,99,235,0.10)', color: '#2563EB' }
    default:            return { dot: '#78716C', bg: 'rgba(120,113,108,0.10)', color: '#78716C' }
  }
}

function txBadge(category: string): { label: string; bg: string; color: string } {
  switch (category) {
    case 'CALLUP':     return { label: '↑ Up',    bg: 'rgba(21,128,61,0.12)',  color: '#15803D' }
    case 'ACTIVATION': return { label: 'Act',     bg: 'rgba(21,128,61,0.12)',  color: '#15803D' }
    case 'OPTION':     return { label: '↓ Opt',   bg: 'rgba(217,119,6,0.12)', color: '#D97706' }
    case 'DFA':        return { label: 'DFA',     bg: 'rgba(220,38,38,0.12)', color: '#DC2626' }
    case 'RELEASE':    return { label: 'Rel',     bg: 'rgba(220,38,38,0.12)', color: '#DC2626' }
    case 'TRADE':      return { label: '⇄ Trade', bg: 'rgba(124,58,237,0.10)', color: '#7C3AED' }
    case 'SUSPENSION': return { label: 'Susp',    bg: 'rgba(220,38,38,0.12)', color: '#DC2626' }
    default:           return { label: category,  bg: 'rgba(120,113,108,0.10)', color: '#78716C' }
  }
}

function ilBadgeStyle(days: number | null): { bg: string; color: string } {
  if (!days || days <= 10) return { bg: 'rgba(220,38,38,0.10)', color: '#DC2626' }
  if (days <= 15) return { bg: 'rgba(217,119,6,0.10)', color: '#D97706' }
  return { bg: 'rgba(37,99,235,0.10)', color: '#2563EB' }
}

// ── Merged, sorted wire feed ─────────────────────────────────────────────────

type WireItem =
  | { kind: 'news'; date: string; data: NewsItem }
  | { kind: 'il'; date: string; data: TeamTransaction }
  | { kind: 'transaction'; date: string; data: TeamTransaction }

function buildWireFeed(
  news: NewsItem[],
  ilList: TeamTransaction[],
  transactions: TeamTransaction[]
): WireItem[] {
  const items: WireItem[] = [
    ...news.map((n): WireItem => ({ kind: 'news', date: n.publishedAt, data: n })),
    ...ilList.map((t): WireItem => ({ kind: 'il', date: t.transaction_date, data: t })),
    ...transactions
      .filter(t => t.category !== 'IL') // IL already covered by ilList
      .map((t): WireItem => ({ kind: 'transaction', date: t.transaction_date, data: t })),
  ]
  items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  return items
}

// ── Row renderers ─────────────────────────────────────────────────────────────

function NewsRow({ item }: { item: NewsItem }) {
  const style = newsCategoryStyle(item.category)
  return (
    <div className="px-4 py-2.5 border-b border-stone-100 last:border-b-0 flex gap-2.5">
      <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: style.dot }} />
      <div className="flex-1 min-w-0">
        <p className="font-serif text-[12px] text-[#1A1A1A] leading-snug">{item.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="font-mono text-[9px] text-stone-400">{item.source}</span>
          <span className="font-mono text-[9px] text-stone-300">·</span>
          <span className="font-mono text-[9px] text-stone-400">{item.publishedDisplay}</span>
        </div>
      </div>
    </div>
  )
}

function ILRow({ item }: { item: TeamTransaction }) {
  const style = ilBadgeStyle(item.il_days)
  return (
    <div className="px-4 py-2.5 border-b border-stone-100 last:border-b-0 flex gap-2.5 items-start">
      <span
        className="font-mono text-[8px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 mt-0.5"
        style={{ background: style.bg, color: style.color }}
      >
        {item.il_days ? `${item.il_days}-DAY IL` : 'IL'}
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-serif text-[12px] text-[#1A1A1A] leading-snug">
          <span className="font-bold">{item.player_name}</span>
          {item.team_name && <span className="text-stone-400"> · {item.team_name}</span>}
        </p>
        {item.injury_reason && (
          <p className="font-mono text-[9px] text-stone-400 mt-0.5">{item.injury_reason}</p>
        )}
      </div>
    </div>
  )
}

function TransactionRow({ item }: { item: TeamTransaction }) {
  const badge = txBadge(item.category)
  return (
    <div className="px-4 py-2.5 border-b border-stone-100 last:border-b-0 flex gap-2.5 items-start">
      <span
        className="font-mono text-[8px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 mt-0.5"
        style={{ background: badge.bg, color: badge.color }}
      >
        {badge.label}
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-serif text-[12px] text-[#1A1A1A] leading-snug">
          <span className="font-bold">{item.player_name}</span>
          {item.team_name && <span className="text-stone-400"> · {item.team_name}</span>}
        </p>
        {item.description && (
          <p className="font-mono text-[9px] text-stone-400 mt-0.5 truncate">{item.description}</p>
        )}
      </div>
    </div>
  )
}

// ── Main panel ─────────────────────────────────────────────────────────────────

export default function TradingFloorWire({
  news,
  ilList,
  transactions,
  maxItems = 12,
}: TradingFloorWireProps) {
  const feed = buildWireFeed(news, ilList, transactions).slice(0, maxItems)

  return (
    <div className="rounded-xl border border-stone-200 overflow-hidden bg-white">
      <div className="px-4 py-2.5 bg-[#1A1A1A] flex items-center justify-between">
        <div className="text-[9px] font-mono font-bold uppercase tracking-widest text-[#FF5722]">
          § The Wire
        </div>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="text-[9px] font-mono font-bold uppercase tracking-wide text-stone-400">live</span>
        </span>
      </div>

      {feed.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <p className="font-mono text-xs text-stone-400">No wire activity in the last 14 days.</p>
        </div>
      ) : (
        <div>
          {feed.map((item, i) => {
            if (item.kind === 'news') return <NewsRow key={`n-${i}`} item={item.data as NewsItem} />
            if (item.kind === 'il') return <ILRow key={`il-${i}`} item={item.data as TeamTransaction} />
            return <TransactionRow key={`tx-${i}`} item={item.data as TeamTransaction} />
          })}
        </div>
      )}

      <div className="px-4 py-2 bg-stone-50 border-t border-stone-100 text-center">
        <a href="/fantasy/news" className="font-mono text-[9px] uppercase tracking-wide text-[#FF5722] hover:underline">
          Full wire →
        </a>
      </div>
    </div>
  )
}
