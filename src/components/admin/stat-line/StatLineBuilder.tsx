'use client'

// src/components/admin/stat-line/StatLineBuilder.tsx
//
// Admin tool: pick a club + player, pull a real game line from the MLB game
// log (or type your own), style it with the team's gradient / full palette and
// export a PNG. No picks, odds or Edge Score anywhere on the graphic.

import { useEffect, useMemo, useRef, useState } from 'react'
import { MLB_TEAMS } from '@/lib/teams'
import { loadHeadshot } from '../story/headshot'
import { loadGameLog, loadRoster, type RosterPlayer } from './actions'
import { EDGE_NEUTRALS, checkPost, defaultGradient, draftPost, shortDate, X_LIMIT, teamPalette, textOn, type Field, type GameLine, type Gradient, type Group } from './logic'
import StatLineCard, { FORMATS, type CardFormat } from './StatLineCard'

type Mode = 'game' | 'custom'
type Line = { headline: string; fields: Field[]; context: string }
const EMPTY_LINE: Line = { headline: '', fields: [], context: '' }
const PREVIEW_W = 420
const SEASON = new Date().getFullYear()

export default function StatLineBuilder() {
  const [teamId, setTeamId] = useState<number>(MLB_TEAMS[0].id)
  const team = MLB_TEAMS.find(t => t.id === teamId) ?? MLB_TEAMS[0]
  const [roster, setRoster] = useState<RosterPlayer[]>([])
  const [playerId, setPlayerId] = useState<number | null>(null)
  const [group, setGroup] = useState<Group>('hitting')
  const [log, setLog] = useState<GameLine[]>([])
  const [logIdx, setLogIdx] = useState(0)
  const [status, setStatus] = useState<string>('')
  const [photo, setPhoto] = useState<string | null>(null)

  // Two independent lines: "game" is pulled from the MLB game log, "custom" is typed from scratch.
  const [mode, setMode] = useState<Mode>('game')
  const [lines, setLines] = useState<Record<Mode, Line>>({ game: EMPTY_LINE, custom: EMPTY_LINE })
  const { headline, fields, context } = lines[mode]
  const patch = (m: Mode, p: Partial<Line>) => setLines(l => ({ ...l, [m]: { ...l[m], ...p } }))
  const setHeadline = (v: string) => patch(mode, { headline: v })
  const setContext = (v: string) => patch(mode, { context: v })
  const setFields = (fn: (fs: Field[]) => Field[]) => setLines(l => ({ ...l, [mode]: { ...l[mode], fields: fn(l[mode].fields) } }))
  const [note, setNote] = useState('')
  const [post, setPost] = useState('')
  const [copied, setCopied] = useState(false)
  const [gradient, setGradient] = useState<Gradient>(() => defaultGradient(MLB_TEAMS[0]))
  const [textMode, setTextMode] = useState<'auto' | 'ink' | 'cream'>('auto')
  const [format, setFormat] = useState<CardFormat>('4:5')
  const [exporting, setExporting] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const started = useRef(false)

  const player = roster.find(p => p.id === playerId) ?? null
  const check = checkPost(post)
  const palette = useMemo(() => teamPalette(team), [team])
  const textColor = textMode === 'ink' ? '#1A1A1A' : textMode === 'cream' ? '#FAF8F3' : textOn(gradient)

  // First roster load (the only effect: it syncs with the external API once on mount).
  useEffect(() => {
    if (started.current) return
    started.current = true
    void onTeam(MLB_TEAMS[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time mount load
  }, [])

  // Loads are driven from event handlers (not effects). `req` drops stale responses.
  const req = useRef(0)

  function applyGame(lines: GameLine[], idx: number) {
    const g = lines[idx]
    if (!g) return
    patch('game', { headline: g.headline, fields: g.fields.map(f => ({ ...f })), context: `${shortDate(g.date)} · ${g.home ? 'vs' : '@'} ${g.opponent}` })
  }

  async function fetchLog(id: number, grp: Group) {
    const mine = ++req.current
    setStatus('Loading game log…')
    const lines = await loadGameLog(id, grp, SEASON)
    if (mine !== req.current) return
    setLog(lines); setLogIdx(0); applyGame(lines, 0)
    setStatus(lines.length ? '' : 'No game log for this player/role — type the line below.')
  }

  async function onTeam(id: number) {
    const t = MLB_TEAMS.find(x => x.id === id) ?? MLB_TEAMS[0]
    const mine = ++req.current
    setTeamId(id); setGradient(defaultGradient(t)); setRoster([]); setPlayerId(null); setLog([]); setPhoto(null)
    patch('game', EMPTY_LINE); setStatus('Loading roster…')
    const r = await loadRoster(id)
    if (mine !== req.current) return
    setRoster(r); setStatus(r.length ? '' : 'No roster returned — try again.')
  }

  async function onPlayer(id: number | null) {
    setPlayerId(id); setPhoto(null)
    if (!id) { setLog([]); return }
    const p = roster.find(x => x.id === id)
    const grp = p?.group ?? 'hitting'
    setGroup(grp)
    void fetchLog(id, grp)
    const d = await loadHeadshot(id, 640)
    setPhoto(prev => (prev === null ? d : prev))
  }

  function onGroup(grp: Group) {
    setGroup(grp)
    if (playerId) void fetchLog(playerId, grp)
  }

  async function exportPng() {
    if (!cardRef.current || !player) return
    setExporting(true)
    try {
      const { toPng } = await import('html-to-image')
      const { w, h } = FORMATS[format]
      const url = await toPng(cardRef.current, { width: w, height: h, pixelRatio: 1, style: { transform: 'none' }, cacheBust: true })
      const a = document.createElement('a')
      a.href = url
      a.download = `the-edge-${player.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${format.replace(':', 'x')}.png`
      a.click()
    } catch (err) {
      console.error('[StatLineBuilder] export failed:', err)
      setStatus('Export failed — check the console.')
    } finally {
      setExporting(false)
    }
  }

  const { w, h } = FORMATS[format]
  const scale = PREVIEW_W / w
  const input = 'rounded-md border border-stone-300 bg-white px-2 py-1 text-sm'
  const swatchRow = (which: 'from' | 'to') => (
    <div className="flex flex-wrap items-center gap-1.5">
      {palette.map(s => (
        <button key={s.hex + s.name} title={`${s.name} ${s.hex}`} onClick={() => setGradient(g => ({ ...g, [which]: s.hex }))}
          className="h-7 w-7 rounded-full border-2" style={{ background: s.hex, borderColor: gradient[which].toLowerCase() === s.hex.toLowerCase() ? '#FF5722' : '#d6d3d1' }} />
      ))}
      <span className="mx-1 h-5 w-px bg-stone-300" title="Edge brand colours" />
      {EDGE_NEUTRALS.map(s => (
        <button key={s.hex} title={`${s.name} ${s.hex}`} onClick={() => setGradient(g => ({ ...g, [which]: s.hex }))}
          className="h-7 w-7 rounded-full border-2" style={{ background: s.hex, borderColor: gradient[which].toLowerCase() === s.hex.toLowerCase() ? '#FF5722' : '#d6d3d1' }} />
      ))}
      <input type="color" value={gradient[which]} onChange={e => setGradient(g => ({ ...g, [which]: e.target.value.toUpperCase() }))} className="h-7 w-9 cursor-pointer rounded border border-stone-300 p-0" title="Custom colour" />
      <span className="font-mono text-[11px] text-stone-500">{gradient[which]}</span>
    </div>
  )

  return (
    <div className="flex flex-col gap-5 lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-4 text-sm">
        <div className="flex w-fit overflow-hidden rounded-full border border-stone-300 font-mono text-xs">
          {(['game', 'custom'] as Mode[]).map(m => (
            <button key={m} onClick={() => setMode(m)} className={`px-4 py-1.5 ${mode === m ? 'bg-[#FF5722] font-bold text-white' : 'bg-white text-stone-700 hover:bg-stone-100'}`}>
              {m === 'game' ? 'Game line' : 'Custom line'}
            </button>
          ))}
        </div>
        <p className="-mt-2 font-mono text-[11px] text-stone-500">
          {mode === 'game' ? 'Pulled from the MLB game log for the player and game you pick (still editable).' : 'Written from scratch: your own headline, stat tiles and lines. The player is only used for the photo and colours.'}
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1"><span className="font-mono text-[11px] uppercase tracking-widest text-stone-500">Team</span>
            <select className={input} value={teamId} onChange={e => void onTeam(Number(e.target.value))}>
              {MLB_TEAMS.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1"><span className="font-mono text-[11px] uppercase tracking-widest text-stone-500">Player</span>
            <select className={input} value={playerId ?? ''} onChange={e => void onPlayer(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Select a player…</option>
              {roster.map(p => <option key={p.id} value={p.id}>{p.name} · {p.pos}</option>)}
            </select>
          </label>
        </div>

        {player && mode === 'game' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1"><span className="font-mono text-[11px] uppercase tracking-widest text-stone-500">Stat group</span>
              <select className={input} value={group} onChange={e => onGroup(e.target.value as Group)}>
                <option value="hitting">Hitting</option><option value="pitching">Pitching</option>
              </select>
            </label>
            <label className="flex flex-col gap-1"><span className="font-mono text-[11px] uppercase tracking-widest text-stone-500">Game</span>
              <select className={input} value={logIdx} disabled={!log.length} onChange={e => { const i = Number(e.target.value); setLogIdx(i); applyGame(log, i) }}>
                {log.map((g, i) => <option key={g.date + i} value={i}>{shortDate(g.date)} · {g.home ? 'vs' : '@'} {g.opponent} · {g.headline}</option>)}
              </select>
            </label>
          </div>
        )}
        {status && <p className="font-mono text-[11px] text-stone-500">{status}</p>}

        <div className="rounded-xl border border-stone-200 bg-white p-3">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-widest text-stone-500">{mode === 'game' ? 'Game line · edit anything' : 'Custom line · type your own'}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input className={input} value={headline} onChange={e => setHeadline(e.target.value)} placeholder={mode === 'game' ? 'Headline (e.g. 3-FOR-4)' : 'Headline (e.g. 0-2 → 3 WINS)'} />
            <input className={input} value={context} onChange={e => setContext(e.target.value)} placeholder={mode === 'game' ? 'Context (e.g. Sep 27 · @ WSH)' : 'Small line under the logo (e.g. ALDS · Game 3)'} />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {fields.map((f, i) => (
              <div key={i} className="flex gap-1">
                <input className={`${input} w-14 font-mono`} value={f.label} onChange={e => setFields(fs => fs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <input className={`${input} w-full font-bold`} value={f.value} onChange={e => setFields(fs => fs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                <button className="px-1 text-stone-400 hover:text-red-600" onClick={() => setFields(fs => fs.filter((_, j) => j !== i))} title="Remove">×</button>
              </div>
            ))}
          </div>
          {fields.length < 8 && <button className="mt-2 font-mono text-[11px] text-stone-600 underline" onClick={() => setFields(fs => [...fs, { label: 'STAT', value: '0' }])}>+ add stat</button>}
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-3">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-widest text-stone-500">Custom lines on the graphic · one per line (max 5)</p>
          <textarea className={`${input} w-full`} rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder={'e.g.\nFirst Guardian with 3 HR in a Game 3\nOnly 3 of 35 teams came back from 0-2'} />
          <p className="mt-1 font-mono text-[11px] text-stone-500">Long notes push the layout up into the photo — keep them short, or drop a stat tile.</p>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-[11px] uppercase tracking-widest text-stone-500">X post text</p>
            <div className="flex items-center gap-3 font-mono text-[11px]">
              <button className="text-stone-600 underline" onClick={() => setPost(draftPost({ name: player?.name ?? '', teamAbbr: team.abbrev, context, headline, fields }))} disabled={!player}>draft from line</button>
              <button className="text-stone-600 underline" onClick={async () => { try { await navigator.clipboard.writeText(post); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { setStatus('Copy failed — select the text manually.') } }} disabled={!post}>{copied ? 'copied ✓' : 'copy'}</button>
              <span className={check.over ? 'font-bold text-red-600' : 'text-stone-500'}>{check.length}/{X_LIMIT}</span>
            </div>
          </div>
          <textarea className={`${input} w-full`} rows={8} value={post} onChange={e => setPost(e.target.value)} placeholder={'Write the post here. Facts and sample sizes, no picks.\n\n#Hashtags are fine.'} />
          {check.hasLink && <p className="mt-1 font-mono text-[11px] font-bold text-[#FF5722]">Looks like a link — links go in the reply, not the post body.</p>}
          {check.banned.length > 0 && <p className="mt-1 font-mono text-[11px] font-bold text-red-600">Off-brand wording: {check.banned.join(', ')} (reads, leans and factors only — no picks/odds language).</p>}
          {check.over && <p className="mt-1 font-mono text-[11px] font-bold text-red-600">Over {X_LIMIT} characters.</p>}
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-3">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-widest text-stone-500">Gradient · {team.short} palette (left of the divider) · Edge colours (right)</p>
          <div className="flex flex-col gap-2">
            <div><span className="mr-2 font-mono text-[11px] text-stone-500">FROM</span>{swatchRow('from')}</div>
            <div><span className="mr-2 font-mono text-[11px] text-stone-500">TO</span>{swatchRow('to')}</div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 font-mono text-[11px] text-stone-600">Angle
                <input type="range" min={0} max={360} value={gradient.angle} onChange={e => setGradient(g => ({ ...g, angle: Number(e.target.value) }))} />{gradient.angle}°
              </label>
              <select className={input} value={gradient.style} onChange={e => setGradient(g => ({ ...g, style: e.target.value as Gradient['style'] }))}>
                <option value="linear">Linear</option><option value="radial">Radial</option>
              </select>
              <button className="font-mono text-[11px] text-stone-600 underline" onClick={() => setGradient(g => ({ ...g, from: g.to, to: g.from }))}>swap</button>
              <button className="font-mono text-[11px] text-stone-600 underline" onClick={() => setGradient(defaultGradient(team))}>reset to team</button>
              <label className="flex items-center gap-2 font-mono text-[11px] text-stone-600">Text
                <select className={input} value={textMode} onChange={e => setTextMode(e.target.value as typeof textMode)}>
                  <option value="auto">Auto</option><option value="cream">Cream</option><option value="ink">Ink</option>
                </select>
              </label>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select className={input} value={format} onChange={e => setFormat(e.target.value as CardFormat)}>
            {Object.entries(FORMATS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button onClick={exportPng} disabled={!player || exporting} className="rounded-full bg-[#FF5722] px-5 py-2 font-mono text-xs font-bold text-white disabled:opacity-40">
            {exporting ? 'Exporting…' : 'Export PNG'}
          </button>
          {!photo && player && <span className="font-mono text-[11px] text-stone-500">headshot loading (or unavailable — initials are used)</span>}
        </div>
      </div>

      <div className="flex justify-center lg:w-[460px]">
        <div style={{ width: PREVIEW_W, height: h * scale, borderRadius: 14, overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,.25)', flex: 'none' }}>
          <div ref={cardRef} style={{ width: w, height: h, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
            <StatLineCard
              format={format} name={player?.name ?? 'Select a Player'} pos={player?.pos ?? ''} jersey={player?.jersey ?? ''}
              teamAbbr={team.abbrev} teamName={team.name} context={context} headline={headline || '—'} note={note} fields={fields}
              gradient={gradient} textColor={textColor} photo={photo} source="MLB Stats API · game log"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
