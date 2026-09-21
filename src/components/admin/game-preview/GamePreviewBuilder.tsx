'use client'

// src/components/admin/game-preview/GamePreviewBuilder.tsx
//
// Admin builder for the Game Preview Graphic — the two probable starters head to
// head. Takes the same per-game data the Scout Report Graphic builder gets (one
// server pass in the dashboard page), so it makes no fetches of its own.
//
// "The read" is drafted from the numbers on the card and editable; an edit is
// kept only for the game it was written for.

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { BuilderGame, BuilderPitcherSide } from '@/components/admin/scout-graphic/ScoutGraphicBuilder'
import type { CardPitcher } from '@/components/admin/scout-graphic/ScoutGraphicCard'
import GamePreviewCard, { PREVIEW_CARD_HEIGHT, type GamePreviewShow } from './GamePreviewCard'
import { draftPreviewRead } from './preview-utils'

const selectCls = 'font-mono text-xs border border-stone-300 rounded px-2 py-1.5 bg-white min-w-[200px]'
const labelCls = 'block font-mono text-[9px] uppercase tracking-widest text-stone-400 mb-1'

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`font-mono text-[10px] uppercase tracking-wider rounded-full border px-3 py-1.5 transition ${
        on ? 'bg-stone-900 border-stone-900 text-white' : 'bg-white border-stone-300 text-stone-500'
      }`}
    >
      {children}
    </button>
  )
}

function toCardPitcher(s: BuilderPitcherSide, abbr: string, oppAbbr: string, color: string): CardPitcher {
  return {
    id: s.id ?? 0, name: s.name, abbr, oppAbbr, color, throws: s.throws,
    stats: s.stats, last3: s.last3, arsenal: s.arsenal, hotZones: s.hotZones, levelLabel: s.levelLabel,
  }
}

export default function GamePreviewBuilder({ games, slateDate }: { games: BuilderGame[]; slateDate: string }) {
  const [gameIdx, setGameIdx] = useState(0)
  const [show, setShow] = useState<GamePreviewShow>({ arsenal: true, last3: true, bottom: 'zones' })
  const [overflowPx, setOverflowPx] = useState(0)
  const [readEdit, setReadEdit] = useState<{ key: number; text: string } | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  const game = games[Math.min(gameIdx, Math.max(games.length - 1, 0))]

  const drafted = useMemo(
    () => (game ? draftPreviewRead(
      { name: game.away.name, stats: game.away.stats, arsenal: game.away.arsenal },
      { name: game.home.name, stats: game.home.stats, arsenal: game.home.arsenal },
    ) : ''),
    [game],
  )

  // The card is a fixed 4:5 canvas; if the chosen modules + read need more height, say so instead of silently clipping.
  const readNow = game ? (readEdit && readEdit.key === game.gamePk ? readEdit.text : drafted) : ''
  useLayoutEffect(() => {
    if (cardRef.current) setOverflowPx(Math.max(0, cardRef.current.scrollHeight - PREVIEW_CARD_HEIGHT))
  }, [game, show, readNow])

  if (!game) {
    return <div className="text-sm font-mono text-stone-400 italic">No games with report data for this slate yet.</div>
  }

  const bothKnown = game.away.id != null && game.home.id != null
  const read = readEdit && readEdit.key === game.gamePk ? readEdit.text : drafted
  const flip = (k: 'arsenal' | 'last3') => setShow(s => ({ ...s, [k]: !s[k] }))
  const dateLabel = new Date(`${slateDate}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

  const handleExport = async () => {
    if (!cardRef.current || isExporting) return
    setIsExporting(true)
    setExportError(null)
    try {
      const { toPng } = await import('html-to-image')
      const dataUrl = await toPng(cardRef.current, { cacheBust: true, backgroundColor: '#FAF8F3', pixelRatio: 3 })
      const link = document.createElement('a')
      link.download = `game-preview-${game.awayAbbr}-at-${game.homeAbbr}.png`.toLowerCase()
      link.href = dataUrl
      link.click()
    } catch (err) {
      console.error('[GamePreviewBuilder] export failed:', err)
      setExportError('Export failed — check the console.')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3 items-end mb-3">
        <div>
          <label className={labelCls}>Game</label>
          <select value={gameIdx} onChange={e => setGameIdx(Number(e.target.value))} className={selectCls}>
            {games.map((g, i) => <option key={g.gamePk} value={i}>{g.matchup}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Modules</label>
          <div className="flex flex-wrap gap-2">
            <Toggle on={show.arsenal} onClick={() => flip('arsenal')}>Arsenal</Toggle>
            <Toggle on={show.last3} onClick={() => flip('last3')}>Last 3 starts</Toggle>
          </div>
        </div>
        <div>
          <label className={labelCls}>Bottom module (one)</label>
          <div className="flex gap-2">
            <Toggle on={show.bottom === 'zones'} onClick={() => setShow(s => ({ ...s, bottom: 'zones' }))}>Zone grids</Toggle>
            <Toggle on={show.bottom === 'tto'} onClick={() => setShow(s => ({ ...s, bottom: 'tto' }))}>Times through order</Toggle>
            <Toggle on={show.bottom === 'none'} onClick={() => setShow(s => ({ ...s, bottom: 'none' }))}>None</Toggle>
          </div>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={isExporting || !bothKnown}
          className="ml-auto px-3 py-1.5 text-xs font-mono rounded bg-stone-900 text-white hover:bg-stone-700 transition disabled:opacity-50"
        >
          {isExporting ? 'Generating…' : 'Export PNG (3240×4050)'}
        </button>
      </div>

      {!bothKnown && (
        <p className="text-[11px] font-mono text-orange-600 mb-2">⚠ A probable pitcher hasn&apos;t been announced for this game yet — the card would show an empty side.</p>
      )}
      {(game.away.levelLabel || game.home.levelLabel) && (
        <p className="text-[11px] font-mono text-stone-500 mb-2">
          ℹ {[game.away.levelLabel && `${game.away.name}: ${game.away.levelLabel}`, game.home.levelLabel && `${game.home.name}: ${game.home.levelLabel}`].filter(Boolean).join(' · ')} — no 2026 MLB rows yet, so the card shows labelled minor-league numbers.
        </p>
      )}
      {overflowPx > 0 && (
        <p className="text-[11px] font-mono text-red-600 mb-2">⚠ This combination is {overflowPx}px taller than the 4:5 card and will be clipped — turn a module off or shorten the read.</p>
      )}
      {exportError && <p className="text-[11px] font-mono text-red-600 mb-2">{exportError}</p>}

      <div className="flex flex-wrap gap-6 items-start">
        <div style={{ width: 540, height: 675, flex: '0 0 540px', overflow: 'hidden', border: '1px solid #e7e2d8', borderRadius: 8 }}>
          <div style={{ transform: 'scale(0.5)', transformOrigin: 'top left', width: 1080, height: 1350 }}>
            <GamePreviewCard
              ref={cardRef}
              dateLabel={dateLabel}
              awayTeamId={game.awayTeamId ?? 0}
              homeTeamId={game.homeTeamId ?? 0}
              awayAbbr={game.awayAbbr}
              homeAbbr={game.homeAbbr}
              venueName={game.venueName}
              firstPitch={game.firstPitch}
              away={toCardPitcher(game.away, game.awayAbbr, game.homeAbbr, game.awayColor)}
              home={toCardPitcher(game.home, game.homeAbbr, game.awayAbbr, game.homeColor)}
              read={read}
              show={show}
            />
          </div>
        </div>

        <div className="flex-1 min-w-[280px] max-w-[520px]">
          <label className={labelCls}>The read (editable — **bold** supported)</label>
          <textarea
            value={read}
            onChange={e => setReadEdit({ key: game.gamePk, text: e.target.value })}
            rows={7}
            placeholder="Nothing comparable yet (a starter is missing stats) — write your own read, or leave blank."
            className="w-full font-mono text-xs border border-stone-300 rounded p-2 bg-white"
          />
          <button
            type="button"
            onClick={() => setReadEdit(null)}
            disabled={!readEdit || readEdit.key !== game.gamePk}
            className="mt-1 font-mono text-[10px] uppercase tracking-wider text-stone-500 underline disabled:opacity-40 disabled:no-underline"
          >
            Reset to draft
          </button>
          <p className="font-mono text-[10px] text-stone-400 mt-3 leading-relaxed">
            The draft only compares numbers on the card (ERA, K/9, BB/9) and names each pitcher&apos;s most-used pitch. The shaded number on each row is the better value on that stat.
            Zone grids and times-through-order share the bottom slot — both together don&apos;t fit a 4:5 card.
          </p>
        </div>
      </div>
    </div>
  )
}
