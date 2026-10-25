'use client'

// src/components/admin/story-v5/PreviewPlayer.tsx
//
// Live Remotion Player preview of the v5 video with a slide panel: tick slides on or off, reorder them, add the optional ones.
// Cold open stays first and the outro stays last when they are on. The video is exactly as long as the ticked slides (45 s is the cap).
// The selection is remembered in this browser only (localStorage, never required: the page works without it).

import { Player, type PlayerRef } from '@remotion/player'
import { useEffect, useMemo, useRef, useState } from 'react'
import { SANS } from '@/components/team/ui'
import { lintCopy } from './actions'
import RenderPanel from './RenderPanel'
import { Sheet, TILE_H, TILE_W, sheetSize } from './remotion/Sheet'
import { Preview, type PreviewProps } from './remotion/Preview'
import { DEFAULT_LOOK, SLIDE_OPTIONS, getOpt, type Look, type OptValue, type SlideOptions } from './remotion/options'
import { defaultTitles, type TitleOverride, type Titles } from './remotion/titles'
import { BLOCK_TYPES, CONTENT_H, EMPTY_CUSTOM, MAX_LINES, MAX_ROWS, customHeight, customReady, customText, migrateCustom, newBlock, type Block, type BlockType, type CustomSlide } from './remotion/custom'
import type { ScoutTopic } from './remotion/scenes/extra'
import { ALL_SCENES, DEFAULT_SCENES, FPS, HEIGHT, MAX_FRAMES, SCENE_CATALOG, WIDTH, layout, type SceneId } from './remotion/config'
import type { PreviewData } from './types'

const LS_KEY = 'edge.storyv5.selection'
const LS_CUSTOM = 'edge.storyv5.custom'
const LS_TITLES = 'edge.storyv5.titles'
const LS_OPTS = 'edge.storyv5.options'
const LS_LOOK = 'edge.storyv5.look'
type Sel = { order: SceneId[]; on: SceneId[] }
const PINNED = new Set<SceneId>(['hook', 'outro'])
const DEFAULT_SEL: Sel = { order: ALL_SCENES, on: DEFAULT_SCENES }

/** Repair whatever was stored: unknown ids dropped, missing slides appended, pinned slides first and last. */
function normalize(raw: unknown): Sel {
  const o = (raw ?? {}) as Partial<Sel>
  const ok = (x: unknown): x is SceneId => typeof x === 'string' && (ALL_SCENES as string[]).includes(x)
  const mid = (Array.isArray(o.order) ? o.order.filter(ok) : []).filter(id => !PINNED.has(id))
  for (const id of ALL_SCENES) if (!PINNED.has(id) && !mid.includes(id)) mid.push(id)
  return { order: ['hook', ...mid, 'outro'], on: Array.isArray(o.on) ? o.on.filter(ok) : DEFAULT_SCENES }
}

export default function PreviewPlayer({ data }: { data: PreviewData }) {
  const ref = useRef<PlayerRef>(null)
  const [sel, setSel] = useState<Sel>(DEFAULT_SEL)
  const [hydrated, setHydrated] = useState(false)
  const [theme, setTheme] = useState<'paper' | 'dark'>('paper')
  const [defenseMode, setDefenseMode] = useState<'home' | 'away' | 'both'>('home')
  const [bullpenMode, setBullpenMode] = useState<'lastGame' | 'last3'>('lastGame')
  const [frame, setFrame] = useState(0)
  const [scoutTopic, setScoutTopic] = useState<ScoutTopic>('run')
  const [custom, setCustom] = useState<CustomSlide[]>([EMPTY_CUSTOM, EMPTY_CUSTOM])
  const [warn, setWarn] = useState<string[]>([])
  const [titles, setTitles] = useState<Titles>({})
  const [editing, setEditing] = useState<SceneId | null>(null)
  const [showSheet, setShowSheet] = useState(false)
  const [options, setOptions] = useState<SlideOptions>({})
  const [look, setLook] = useState<Look>(DEFAULT_LOOK)

  useEffect(() => {
    Promise.resolve().then(() => {
      try { const raw = window.localStorage.getItem(LS_KEY); if (raw) setSel(normalize(JSON.parse(raw))) } catch { /* storage blocked */ }
      try {
        const c = JSON.parse(window.localStorage.getItem(LS_CUSTOM) ?? 'null')
        if (Array.isArray(c) && c.length === 2) setCustom([migrateCustom(c[0]), migrateCustom(c[1])])
      } catch { /* storage blocked */ }
      try { const o = JSON.parse(window.localStorage.getItem(LS_OPTS) ?? 'null'); if (o && typeof o === 'object') setOptions(o) } catch { /* storage blocked */ }
      try { const l = JSON.parse(window.localStorage.getItem(LS_LOOK) ?? 'null'); if (l && typeof l === 'object') setLook({ ...DEFAULT_LOOK, ...l }) } catch { /* storage blocked */ }
      try { const t = JSON.parse(window.localStorage.getItem(LS_TITLES) ?? 'null'); if (t && typeof t === 'object') setTitles(t) } catch { /* storage blocked */ }
      setHydrated(true)
    })
  }, [])
  useEffect(() => {
    if (!hydrated) return
    try { window.localStorage.setItem(LS_KEY, JSON.stringify(sel)) } catch { /* storage unavailable */ }
  }, [sel, hydrated])
  useEffect(() => {
    if (!hydrated) return
    try { window.localStorage.setItem(LS_TITLES, JSON.stringify(titles)) } catch { /* storage unavailable */ }
  }, [titles, hydrated])
  useEffect(() => {
    if (!hydrated) return
    try { window.localStorage.setItem(LS_OPTS, JSON.stringify(options)); window.localStorage.setItem(LS_LOOK, JSON.stringify(look)) } catch { /* storage unavailable */ }
  }, [options, look, hydrated])
  useEffect(() => {
    if (!hydrated) return
    try { window.localStorage.setItem(LS_CUSTOM, JSON.stringify(custom)) } catch { /* storage unavailable */ }
    const t = setTimeout(() => { lintCopy([...custom.flatMap(customText), ...Object.values(titles).flatMap(o => [o?.kicker ?? '', o?.headline ?? '', o?.extra ?? ''])]).then(setWarn).catch(() => setWarn([])) }, 600)
    return () => clearTimeout(t)
  }, [custom, titles, hydrated])

  // A slide that has nothing to show is unavailable (its tick box is disabled and it is left out of the video).
  const unavailable = useMemo((): Partial<Record<SceneId, string>> => ({
    ...(data.scout?.[scoutTopic].length ? {} : { scout: 'no data for this game' }),
    ...(customReady(custom[0]) ? {} : { custom: 'type words or choose a block below' }),
    ...(customReady(custom[1]) ? {} : { custom2: 'type words or choose a block below' }),
  }), [data, scoutTopic, custom])
  const scenes = useMemo(() => sel.order.filter(id => sel.on.includes(id) && !unavailable[id]), [sel, unavailable])
  const lay = useMemo(() => layout(scenes), [scenes])
  const label = (id: SceneId) => SCENE_CATALOG.find(c => c.id === id)!
  const toggle = (id: SceneId) => setSel(s => ({ ...s, on: s.on.includes(id) ? s.on.filter(x => x !== id) : [...s.on, id] }))
  const move = (id: SceneId, dir: -1 | 1) => setSel(s => {
    const mid = s.order.filter(x => !PINNED.has(x)), i = mid.indexOf(id), j = i + dir
    if (i < 0 || j < 0 || j >= mid.length) return s
    ;[mid[i], mid[j]] = [mid[j], mid[i]]
    return { ...s, order: ['hook', ...mid, 'outro'] }
  })
  const homeThenAway = () => setSel(s => {
    const mid = s.order.filter(x => !PINNED.has(x) && x !== 'defenseAway')
    const i = mid.indexOf('defense')
    mid.splice(i + 1, 0, 'defenseAway')
    return { order: ['hook', ...mid, 'outro'], on: [...new Set([...s.on, 'defense', 'defenseAway'])] as SceneId[] }
  })
  const setT = (id: SceneId, patch: TitleOverride) => setTitles(ts => ({ ...ts, [id]: { ...ts[id], ...patch } }))
  const changed = (id: SceneId) => { const o = titles[id]; return !!o && [o.kicker, o.headline, o.extra].some(x => x && x.trim() !== '') }
  const setO = (id: SceneId, key: string, v: OptValue) => setOptions(o => ({ ...o, [id]: { ...o[id], [key]: v } }))
  const optsChanged = (id: SceneId) => Object.keys(options[id] ?? {}).some(k => options[id]?.[k] !== SLIDE_OPTIONS[id]?.find(d => d.key === k)?.default)
  const setC = (i: number, patch: Partial<CustomSlide>) => setCustom(cs => cs.map((c, k) => (k === i ? { ...c, ...patch } : c)))
  const setBlocks = (i: number, f: (bs: Block[]) => Block[]) => setCustom(cs => cs.map((c, k) => (k === i ? { ...c, blocks: f(c.blocks) } : c)))
  const patchBlock = (i: number, id: string, patch: Partial<Block>) => setBlocks(i, bs => bs.map(b => (b.id === id ? ({ ...b, ...patch } as Block) : b)))
  const moveBlock = (i: number, id: string, dir: -1 | 1) => setBlocks(i, bs => { const a = [...bs], x = a.findIndex(b => b.id === id), y = x + dir; if (x < 0 || y < 0 || y >= a.length) return bs; [a[x], a[y]] = [a[y], a[x]]; return a })
  const seek = (f: number) => { setFrame(f); ref.current?.pause(); ref.current?.seekTo(f) }
  const over = lay.total > MAX_FRAMES
  const btn = (on: boolean) => ({ border: '1px solid #1A1A1A', background: on ? '#1A1A1A' : '#fff', color: on ? '#fff' : '#1A1A1A', padding: '4px 10px', fontSize: 13, fontWeight: 700 as const })
  const mid = sel.order.filter(x => !PINNED.has(x))

  void TILE_W; void TILE_H
  const renderProps: PreviewProps = { data, scenes, theme, defenseMode, bullpenMode, scoutTopic, custom, titles, options, look }
  return (
    <>
    <div style={{ fontFamily: SANS, marginTop: 16, display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <div style={{ width: 540 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center' }}>
          {(['paper', 'dark'] as const).map(t => <button key={t} onClick={() => setTheme(t)} style={btn(theme === t)}>{t}</button>)}
          <span style={{ width: 12 }} />
          {(['home', 'away', 'both'] as const).map(m => <button key={m} onClick={() => setDefenseMode(m)} style={btn(defenseMode === m)}>defense {m}</button>)}
          <span style={{ width: 12 }} />
          {(['lastGame', 'last3'] as const).map(m => <button key={m} onClick={() => setBullpenMode(m)} style={btn(bullpenMode === m)}>{m === 'lastGame' ? 'bullpen: last game' : 'bullpen: last 3 days'}</button>)}
        </div>
        {lay.scenes.length ? (
          <Player
            ref={ref}
            component={Preview as never}
            inputProps={{ data, scenes, theme, defenseMode, bullpenMode, scoutTopic, custom, titles, options, look }}
            durationInFrames={lay.total} fps={FPS} compositionWidth={WIDTH} compositionHeight={HEIGHT}
            style={{ width: 540, height: 675, border: '1px solid #e7e2d8' }} controls loop acknowledgeRemotionLicense
          />
        ) : <div style={{ width: 540, height: 675, border: '1px dashed #a89e8c', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5C5A55' }}>Tick at least one slide.</div>}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
          <input id="v5-frame" type="range" min={0} max={Math.max(0, lay.total - 1)} value={Math.min(frame, Math.max(0, lay.total - 1))} style={{ flex: 1 }} onChange={e => seek(Number(e.target.value))} />
          <span style={{ fontSize: 13, width: 90, fontVariantNumeric: 'tabular-nums' }}>{frame} / {lay.total}</span>
        </div>
      </div>

      <div style={{ flex: '1 1 320px', minWidth: 300, maxWidth: 520 }}>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.12em', color: '#FF5722' }}>SLIDES</div>
        <div id="v5-length" style={{ fontSize: 14, margin: '4px 0 10px', color: over ? '#D4533B' : '#5C5A55', fontWeight: over ? 800 : 500 }}>
          {lay.scenes.length} slides · {(lay.total / FPS).toFixed(1)} s{over ? ` · over the ${MAX_FRAMES / FPS} s limit, switch a slide off` : ''}
        </div>
        {sel.order.map(id => {
          const c = label(id), off = unavailable[id], on = sel.on.includes(id) && !off, i = mid.indexOf(id)
          const start = lay.scenes.find(s => s.id === id)?.from
          return (
            <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #e7e2d8', background: on ? '#fff' : '#f6f3ec', padding: '6px 10px', marginBottom: 6, opacity: on ? 1 : 0.65 }}>
              <input type="checkbox" checked={on} disabled={!!off} onChange={() => toggle(id)} aria-label={`include ${c.label}`} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{c.label}{c.optional ? <span style={{ marginLeft: 6, fontSize: 11, color: '#a89e8c' }}>optional</span> : null}</div>
                <div style={{ fontSize: 12, color: off ? '#D4533B' : '#5C5A55' }}>{off ? `Unavailable: ${off}` : c.blurb}</div>
              </div>
              <button onClick={() => setEditing(editing === id ? null : id)} aria-label={`edit text ${c.label}`} style={{ ...btn(editing === id || changed(id) || optsChanged(id)), padding: '2px 8px', fontSize: 12 }}>{changed(id) || optsChanged(id) ? 'edit (changed)' : 'edit'}</button>
              {on && start != null ? <button onClick={() => seek(start)} style={{ ...btn(false), padding: '2px 8px', fontSize: 12 }}>go to</button> : null}
              {c.pinned ? <span style={{ fontSize: 11, color: '#a89e8c', width: 38, textAlign: 'right' }}>{c.pinned}</span> : (
                <span style={{ display: 'flex', flexDirection: 'column' }}>
                  <button disabled={i <= 0} onClick={() => move(id, -1)} aria-label="move up" style={{ fontSize: 11, lineHeight: 1, padding: '1px 6px' }}>▲</button>
                  <button disabled={i >= mid.length - 1} onClick={() => move(id, 1)} aria-label="move down" style={{ fontSize: 11, lineHeight: 1, padding: '1px 6px' }}>▼</button>
                </span>
              )}
            </div>
          )
        })}
        {editing ? (() => {
          const isCustom = editing === 'custom' || editing === 'custom2'
          const def = defaultTitles(editing, data, { defenseMode, bullpenMode, scoutTopic })
          const o = titles[editing] ?? {}
          const fields: [keyof TitleOverride, string, string][] = [['kicker', 'Small line above the headline', def.kicker], ['headline', 'Headline', def.headline], ['extra', def.extraLabel ?? '', def.extra]]
          const defs = SLIDE_OPTIONS[editing] ?? []
          return (
            <div id="v5-text-editor" style={{ border: '2px solid #FF5722', background: '#fff', padding: 10, marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.12em', color: '#FF5722' }}>EDIT · {label(editing).label.toUpperCase()}</div>
              {isCustom ? <div style={{ fontSize: 12, color: '#5C5A55', marginTop: 4 }}>Its words are typed in the Custom slide box further down.</div> : fields.filter(([k]) => (k === 'extra' ? !!def.extraLabel : !(k === 'kicker' && editing === 'outro'))).map(([k, l, d]) => (
                <label key={k} style={{ display: 'block', marginTop: 8, fontSize: 12, color: '#5C5A55' }}>{l}
                  <input value={o[k] ?? ''} placeholder={d} aria-label={`text ${k}`} onChange={e => setT(editing, { [k]: e.target.value })}
                    style={{ display: 'block', width: '100%', boxSizing: 'border-box', border: '1px solid #e7e2d8', padding: '5px 8px', marginTop: 3, fontFamily: SANS, fontSize: 13 }} />
                </label>
              ))}
              {defs.length ? <div style={{ marginTop: 10, fontSize: 12, fontWeight: 800, letterSpacing: '.1em', color: '#5C5A55' }}>WHAT THIS SLIDE SHOWS</div> : null}
              {defs.map(d => {
                const v = getOpt(options, editing, d.key)
                return d.type === 'bool' ? (
                  <label key={d.key} style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, fontSize: 13 }}>
                    <input type="checkbox" checked={v === true} aria-label={`option ${d.key}`} onChange={e => setO(editing, d.key, e.target.checked)} />{d.label}
                  </label>
                ) : (
                  <label key={d.key} style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, fontSize: 13 }}>{d.label}
                    <select value={String(v)} aria-label={`option ${d.key}`} onChange={e => setO(editing, d.key, e.target.value)} style={{ border: '1px solid #e7e2d8', padding: '2px 6px', fontFamily: SANS }}>
                      {d.choices.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </label>
                )
              })}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button onClick={() => { setTitles(ts => { const n = { ...ts }; delete n[editing]; return n }); setOptions(os => { const n = { ...os }; delete n[editing]; return n }) }} style={btn(false)}>Back to default wording and options</button>
                <button onClick={() => setEditing(null)} style={btn(false)}>Done</button>
              </div>
            </div>
          )
        })() : null}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
          <button onClick={homeThenAway} style={btn(false)}>Defense: home then away</button>
          <button onClick={() => setSel(DEFAULT_SEL)} style={btn(false)}>Reset slides</button>
          <button onClick={() => setTitles({})} style={btn(false)}>Reset all text</button>
          <button onClick={() => { setOptions({}); setLook(DEFAULT_LOOK) }} style={btn(false)}>Reset options</button>
          <button onClick={() => setShowSheet(v => !v)} style={btn(showSheet)}>Contact sheet</button>
        </div>
        <div style={{ marginTop: 14, fontSize: 13, fontWeight: 800, letterSpacing: '.12em', color: '#FF5722' }}>TEAM LOGOS ON EVERY SLIDE</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {([['off', 'no header'], ['logos', 'logo header'], ['matchup', 'matchup header']] as const).map(([m, l]) => <button key={m} onClick={() => setLook(k => ({ ...k, header: m }))} style={btn(look.header === m)}>{l}</button>)}
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={look.watermark} aria-label="logo watermark" onChange={e => setLook(k => ({ ...k, watermark: e.target.checked }))} />faint big logos behind</label>
        </div>
        <div style={{ marginTop: 14, fontSize: 13, fontWeight: 800, letterSpacing: '.12em', color: '#FF5722' }}>SCOUT REPORT SLIDE</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          {(['run', 'late'] as const).map(t => <button key={t} onClick={() => setScoutTopic(t)} style={btn(scoutTopic === t)}>{t === 'run' ? 'running game' : 'late and close'}</button>)}
        </div>
        {([0, 1] as const).map(i => {
          const used = customHeight(custom[i]), over = used > CONTENT_H
          const field = { display: 'block', width: '100%', boxSizing: 'border-box' as const, border: '1px solid #e7e2d8', padding: '5px 8px', marginTop: 6, fontFamily: SANS, fontSize: 13 }
          const tiny = { fontSize: 11, lineHeight: 1, padding: '1px 6px' }
          return (
            <div key={i} id={`v5-custom-${i + 1}`} style={{ marginTop: 14, border: '1px solid #e7e2d8', background: '#fff', padding: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.12em', color: '#FF5722' }}>CUSTOM SLIDE {i + 1}</span>
                <span style={{ fontSize: 12, color: over ? '#D4533B' : '#5C5A55', fontWeight: over ? 800 : 500 }}>{over ? 'Too full: remove a block or shorten it' : `Space used: ${Math.round((used / CONTENT_H) * 100)}%`}</span>
              </div>
              <input value={custom[i].kicker} placeholder="Small line above the headline" aria-label={`custom ${i + 1} kicker`} onChange={e => setC(i, { kicker: e.target.value })} style={field} />
              <input value={custom[i].headline} placeholder="Headline" aria-label={`custom ${i + 1} headline`} onChange={e => setC(i, { headline: e.target.value })} style={field} />
              {custom[i].blocks.map(b => (
                <div key={b.id} data-block={b.type} style={{ marginTop: 8, border: '1px solid #e7e2d8', background: '#faf8f3', padding: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ flex: 1, fontSize: 12, fontWeight: 800, letterSpacing: '.08em' }}>{BLOCK_TYPES.find(x => x.type === b.type)!.label.toUpperCase()}</span>
                    <button aria-label="move block up" onClick={() => moveBlock(i, b.id, -1)} style={tiny}>▲</button>
                    <button aria-label="move block down" onClick={() => moveBlock(i, b.id, 1)} style={tiny}>▼</button>
                    <button aria-label="remove block" onClick={() => setBlocks(i, bs => bs.filter(x => x.id !== b.id))} style={{ ...tiny, color: '#D4533B' }}>Remove</button>
                  </div>
                  {b.type === 'number' ? <>
                    <input value={b.value} placeholder="Big number or word, like 35.9% or +12" aria-label="block number" onChange={e => patchBlock(i, b.id, { value: e.target.value })} style={field} />
                    <input value={b.label} placeholder="What it is" aria-label="block label" onChange={e => patchBlock(i, b.id, { label: e.target.value })} style={field} />
                  </> : null}
                  {b.type === 'lines' ? <textarea value={b.lines.join('\n')} rows={4} placeholder={`Up to ${MAX_LINES} lines, one per row`} aria-label="block lines" onChange={e => patchBlock(i, b.id, { lines: e.target.value.split('\n').slice(0, MAX_LINES) })} style={field} /> : null}
                  {b.type === 'logos' ? <div style={{ display: 'flex', gap: 8, marginTop: 6, fontSize: 13 }}>
                    <select value={b.teams} aria-label="block teams" onChange={e => patchBlock(i, b.id, { teams: e.target.value as 'away' | 'home' | 'both' })} style={{ fontFamily: SANS }}><option value="both">Both teams</option><option value="away">{data.teams.away.abbr} only</option><option value="home">{data.teams.home.abbr} only</option></select>
                    <select value={b.size} aria-label="block size" onChange={e => patchBlock(i, b.id, { size: e.target.value as 's' | 'm' | 'l' })} style={{ fontFamily: SANS }}><option value="s">Small</option><option value="m">Medium</option><option value="l">Large</option></select>
                  </div> : null}
                  {b.type === 'matchup' ? <div style={{ display: 'flex', gap: 14, marginTop: 6, fontSize: 13 }}>
                    <label><input type="checkbox" checked={b.pitchers} onChange={e => patchBlock(i, b.id, { pitchers: e.target.checked })} /> starting pitchers</label>
                    <label><input type="checkbox" checked={b.firstPitch} onChange={e => patchBlock(i, b.id, { firstPitch: e.target.checked })} /> first pitch (ET and PT)</label>
                  </div> : null}
                  {b.type === 'pitchers' ? <div style={{ fontSize: 12, color: '#5C5A55', marginTop: 4 }}>{data.starters.away.name} and {data.starters.home.name}</div> : null}
                  {b.type === 'compare' ? <div>
                    <div style={{ fontSize: 11, color: '#5C5A55', marginTop: 4 }}>Columns: {data.teams.away.abbr} number, label, {data.teams.home.abbr} value</div>
                    {b.rows.map((r, k) => (
                      <div key={k} style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                        {(['away', 'label', 'home'] as const).map(f => <input key={f} value={r[f]} placeholder={f === 'label' ? 'Label' : f === 'away' ? data.teams.away.abbr : data.teams.home.abbr} aria-label={`row ${k + 1} ${f}`}
                          onChange={e => patchBlock(i, b.id, { rows: b.rows.map((x, j) => (j === k ? { ...x, [f]: e.target.value } : x)) })} style={{ flex: 1, minWidth: 0, border: '1px solid #e7e2d8', padding: '4px 6px', fontFamily: SANS, fontSize: 13 }} />)}
                        <button aria-label="remove row" onClick={() => patchBlock(i, b.id, { rows: b.rows.filter((_, j) => j !== k) })} style={{ ...tiny, color: '#D4533B' }}>Remove</button>
                      </div>
                    ))}
                    {b.rows.length < MAX_ROWS ? <button onClick={() => patchBlock(i, b.id, { rows: [...b.rows, { label: '', away: '', home: '' }] })} style={{ ...btn(false), marginTop: 6, padding: '2px 8px', fontSize: 12 }}>+ row</button> : null}
                  </div> : null}
                </div>
              ))}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#5C5A55' }}>New block:</span>
                {BLOCK_TYPES.map(x => <button key={x.type} title={x.blurb} aria-label={`add ${x.type} to custom ${i + 1}`} onClick={() => setBlocks(i, bs => [...bs, newBlock(x.type as BlockType)])} style={{ ...btn(false), padding: '2px 8px', fontSize: 12 }}>+ {x.label}</button>)}
              </div>
            </div>
          )
        })}
        {warn.length ? <div id="v5-warn" style={{ marginTop: 8, fontSize: 12, color: '#D4533B' }}>Heads up: the Scout vocabulary avoids these words, check they fit: {warn.join(', ')}</div> : null}
      </div>
    </div>
    {showSheet && lay.scenes.length ? (
      <div id="v5-sheet" style={{ marginTop: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.12em', color: '#FF5722', marginBottom: 6 }}>CONTACT SHEET · ONE FRAME PER SLIDE, AFTER ITS ANIMATIONS FINISH</div>
        <Player component={Sheet as never} inputProps={renderProps} durationInFrames={1} fps={FPS} compositionWidth={sheetSize(lay.scenes.length).width} compositionHeight={sheetSize(lay.scenes.length).height} style={{ width: Math.min(1100, sheetSize(lay.scenes.length).width / 2), aspectRatio: `${sheetSize(lay.scenes.length).width} / ${sheetSize(lay.scenes.length).height}`, border: '1px solid #e7e2d8' }} acknowledgeRemotionLicense />
      </div>
    ) : null}
    <RenderPanel gamePk={data.gamePk} slateDate={data.slateDate} props={renderProps} />
    </>
  )
}
