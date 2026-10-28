'use client'

// src/components/graphics/GraphicsStudio.tsx
//
// Admin tool: pick a template, load a preset or type your own content, preview the block
// and download a PNG for X. Same layout and look as the other dashboard builders
// (StatLineBuilder, ScoutGraphicBuilder). Nothing is saved server side; export is a download only.

import { useEffect, useMemo, useRef, useState } from 'react'
import { OTD_SIZES, SIZES } from '@/lib/graphics/constants'
import { otdFileName, renderOtdPng } from '@/lib/graphics/otd-export'
import { loadGraphicImages } from '@/lib/graphics/images'
import { imageKeys } from '@/lib/graphics/teams'
import { parseItemList, parsePipeList } from '@/lib/graphics/parse-pipe'
import { PRESETS } from '@/lib/graphics/presets'
import { validateSpec } from '@/lib/graphics/schema'
import type { Chip, GraphicImages, GraphicSpec, SizeKey, Stat, TeamKey, TemplateId } from '@/lib/graphics/types'
import { MLB_TEAMS } from '@/lib/teams'
import { autofillGraphic, loadSlate, searchPlayers, type AutofillTemplate, type PlayerHit, type SlateGame } from './actions'
import { BLOCKS, TEMPLATE_NAMES } from './index'
import OtdForm from './otd/OtdForm'

type Mode = 'form' | 'json'

// Layout slots each block reads, and the panel tab text it falls back to.
const GROUPS: Record<TemplateId, { group: string; title: string }[]> = {
  collision: [{ group: 'hero', title: 'Two big numbers' }, { group: 'tile', title: 'Scoreboard strip' }],
  arsenal: [{ group: 'pitch', title: 'Arsenal' }, { group: 'ks', title: 'Strikeouts by pitch' }, { group: 'tile', title: 'Scoreboard strip' }],
  contrast: [{ group: 'contrast', title: 'October vs season' }, { group: 'pitch', title: 'Arsenal' }, { group: 'tile', title: 'Scoreboard strip' }],
  attack: [{ group: 'TB', title: 'Rays hitters' }, { group: 'MIL', title: 'Brewers hitters' }, { group: 'oaa', title: 'Scoreboard strip' }],
  scoreboard: [{ group: 'catcher', title: 'Catchers' }, { group: 'run', title: 'Running game' }, { group: 'abs', title: 'Strike zone challenges won' }],
  textlist: [{ group: 'item', title: 'N triggers' }],
  otd: [],
  sotd: [],
}
const DEFAULT_PASTE_GROUP: Record<TemplateId, string> = { collision: 'tile', arsenal: 'pitch', contrast: 'contrast', attack: 'TB', scoreboard: 'run', textlist: 'item', otd: '', sotd: '' }
const TEAMS: TeamKey[] = ['neutral', ...[...MLB_TEAMS].map(t => t.abbrev).sort()]
const input = 'rounded-md border border-stone-300 bg-white px-2 py-1 text-sm'
const lab = 'text-[11px] uppercase tracking-widest text-stone-500'
const box = 'rounded-xl border border-stone-200 bg-white p-3'

const pretty = (s: GraphicSpec) => JSON.stringify(s, null, 2)
const clone = (s: GraphicSpec): GraphicSpec => JSON.parse(JSON.stringify(s))

export default function GraphicsStudio() {
  const [spec, setSpec] = useState<GraphicSpec>(() => clone(PRESETS[0]))
  const [jsonText, setJsonText] = useState(() => pretty(PRESETS[0]))
  const [jsonErrors, setJsonErrors] = useState<string[]>([])
  const [mode, setMode] = useState<Mode>('form')
  const [previewSize, setPreviewSize] = useState<SizeKey>('landscape')
  const [pasteText, setPasteText] = useState('')
  const [pasteGroup, setPasteGroup] = useState(DEFAULT_PASTE_GROUP[PRESETS[0].template])
  const [pasteMsg, setPasteMsg] = useState<string[]>([])
  const [exporting, setExporting] = useState<SizeKey | null>(null)
  const [exportError, setExportError] = useState('')
  const [images, setImages] = useState<GraphicImages>({})
  const [slateDate, setSlateDate] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }))
  const [slate, setSlate] = useState<SlateGame[]>([])
  const [slateMsg, setSlateMsg] = useState('Loading slate…')
  const [gamePk, setGamePk] = useState<number | null>(null)
  const [side, setSide] = useState<'away' | 'home'>('away')
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<PlayerHit[]>([])
  const [searching, setSearching] = useState(false)
  const [target, setTarget] = useState('header')   // where a clicked search result goes: 'header' or a row index
  const [filling, setFilling] = useState(false)
  const [fillMissing, setFillMissing] = useState<string[]>([])
  const [fillError, setFillError] = useState('')
  const [boxW, setBoxW] = useState(480)
  const boxRef = useRef<HTMLDivElement>(null)
  const exportRefs = useRef<Record<SizeKey, HTMLDivElement | null>>({ landscape: null, portrait: null })

  const check = useMemo(() => validateSpec(spec), [spec])
  const errors = [...jsonErrors, ...(check.ok ? [] : check.errors)]
  const isOtd = spec.template === 'otd' || spec.template === 'sotd'
  const canExport = errors.length === 0 && (isOtd || spec.stats.length > 0)
  const [overflow, setOverflow] = useState<string[]>([])

  // Measures the preview column so the full-size node can be scaled to fit (an external DOM sync, hence an effect).
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth))
    ro.observe(el)
    setBoxW(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  // Preload logos, the x9 mark and the headshot as data URLs so the export never waits on the network.
  const keyList = imageKeys(spec).join(',')
  useEffect(() => {
    let live = true
    void loadGraphicImages(keyList.split(',')).then(m => { if (live) setImages(m) })
    return () => { live = false }
  }, [keyList])

  // Slate for the chosen day (free MLB schedule, read by a server action behind /admin auth).
  useEffect(() => {
    let live = true
    void loadSlate(slateDate).then(g => {
      if (!live) return
      setSlate(g); setGamePk(g[0]?.gamePk ?? null)
      setSlateMsg(g.length ? '' : 'No games found for that date.')
    })
    return () => { live = false }
  }, [slateDate])

  // Inline warning: after the card settles (headline and tile text shrink to fit first), list any text that is still cut off in its slot.
  useEffect(() => {
    if (!isOtd) { setOverflow([]); return }
    const t = window.setTimeout(() => {
      const root = exportRefs.current[previewSize]
      if (!root) return
      const found = new Set<string>()
      root.querySelectorAll<HTMLElement>('*').forEach(el => {
        const txt = (el.textContent ?? '').trim()
        if (!txt || el.children.length > 0) return
        const cs = getComputedStyle(el)
        const clippedX = cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1
        const clippedY = el.scrollHeight > el.clientHeight + 2 && cs.overflow === 'hidden'
        if (clippedX || clippedY) found.add(txt.length > 48 ? `${txt.slice(0, 46)}…` : txt)
      })
      setOverflow([...found])
    }, 250)
    return () => window.clearTimeout(t)
  }, [spec, previewSize, isOtd]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fill(template: AutofillTemplate) {
    const game = slate.find(g => g.gamePk === gamePk)
    if (!game) return
    setFilling(true); setFillError(''); setFillMissing([])
    const r = await autofillGraphic({ game, template, side, kicker: spec.kicker || 'Scout', date: slateDate })
    setFilling(false)
    if ('error' in r) { setFillError(r.error); return }
    commit(r.spec)
    setPasteGroup(DEFAULT_PASTE_GROUP[r.spec.template])
    setFillMissing(r.missing)
  }

  async function find() {
    setSearching(true)
    setHits(await searchPlayers(query))
    setSearching(false)
  }
  function choosePlayer(h: PlayerHit) {
    if (target === 'header') patch({ player: { id: h.id, team: spec.player?.team } })
    else patchStat(Number(target), { playerId: h.id })
  }

  function commit(next: GraphicSpec) {
    setSpec(next)
    setJsonText(pretty(next))
    setJsonErrors([])
  }
  const patch = (p: Partial<GraphicSpec>) => commit({ ...spec, ...p })
  const patchStat = (i: number, p: Partial<Stat>) => commit({ ...spec, stats: spec.stats.map((s, j) => (j === i ? { ...s, ...p } : s)) })
  const patchChip = (i: number, p: Partial<Chip>) => commit({ ...spec, chips: spec.chips.map((c, j) => (j === i ? { ...c, ...p } : c)) })
  const setMap = (key: 'panels' | 'notes', group: string, v: string) => {
    const m = { ...(spec[key] ?? {}) }
    if (v) m[group] = v; else delete m[group]
    commit({ ...spec, [key]: Object.keys(m).length ? m : undefined })
  }

  function loadPreset(id: string) {
    const p = PRESETS.find(x => x.id === id)
    if (!p) return
    commit(clone(p))
    setPasteGroup(DEFAULT_PASTE_GROUP[p.template])
    setPasteMsg([])
  }
  function setTemplate(t: TemplateId) {
    const toOtd = t === 'otd' || t === 'sotd'
    if (toOtd && !spec.otd) {
      commit({ id: spec.id, template: t, kicker: '', title: 'Headline', subtitle: '', chips: [], stats: [], otd: { date: '', body: { sections: [{ type: 'kv', label: 'Label', rows: [{ label: '', value: '' }] }] } } })
      return
    }
    if (!toOtd && isOtd) { commit({ ...clone(PRESETS[0]), template: t }); setPasteGroup(DEFAULT_PASTE_GROUP[t]); return }
    commit({ ...spec, template: t })
    setPasteGroup(DEFAULT_PASTE_GROUP[t])
  }
  function onJson(text: string) {
    setJsonText(text)
    let raw: unknown
    try { raw = JSON.parse(text) } catch (e) { setJsonErrors([`JSON: ${(e as Error).message}`]); return }
    const r = validateSpec(raw)
    if (r.ok) { setSpec(r.spec); setJsonErrors([]) } else setJsonErrors(r.errors)
  }
  function applyPaste() {
    if (spec.template === 'textlist') {
      const items = parseItemList(pasteText)
      setPasteMsg(items.length ? [] : ['Nothing to apply.'])
      if (items.length) commit({ ...spec, stats: items })
      return
    }
    const { stats, errors: errs } = parsePipeList(pasteText)
    setPasteMsg(errs.map(e => `Entry ${e.index + 1}: ${e.message}`))
    if (!stats.length) return
    const rows = stats.map<Stat>(s => ({ ...s, group: pasteGroup }))
    commit({ ...spec, stats: [...spec.stats.filter(s => s.group !== pasteGroup), ...rows] })
  }

  async function exportPng(size: SizeKey) {
    const node = exportRefs.current[size]
    if (!node || !canExport) return
    setExporting(size); setExportError('')
    try {
      let url: string, name: string
      if (isOtd) {
        url = await renderOtdPng(node, size)
        name = otdFileName(spec.id, spec.title)
        if (size === 'portrait') name = name.replace(/\.png$/, '-4x5.png')
      } else {
        const { toPng } = await import('html-to-image')
        const { w, h } = SIZES[size]
        url = await toPng(node, { cacheBust: true, backgroundColor: '#FAF8F3', width: w, height: h, pixelRatio: 1 })
        name = `${spec.id}-${size}.png`
      }
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
    } catch (err) {
      console.error('[GraphicsStudio] export failed:', err)
      setExportError('Export failed — check the console.')
    } finally {
      setExporting(null)
    }
  }

  const Block = BLOCKS[spec.template]
  const { w, h } = SIZES[previewSize]
  const scale = Math.min(1, boxW / w)
  const groups = GROUPS[spec.template]

  return (
    <div className="gs-wrap">
      <style>{`
        .gs-wrap{display:flex;gap:20px;align-items:flex-start}
        .gs-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:16px;font-size:14px}
        .gs-prev{flex:0 0 500px;min-width:0;position:sticky;top:12px}
        .gs-btn{min-height:44px;padding:0 20px;border-radius:9999px;background:#FF5722;color:#fff;font-weight:700;font-size:13px;cursor:pointer}
        .gs-btn:disabled{opacity:.4;cursor:not-allowed}
        .gs-row{display:grid;grid-template-columns:90px minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr) 60px 56px 36px;gap:6px;align-items:center}
        @media (max-width:768px){
          .gs-wrap{flex-direction:column}
          .gs-prev{flex:none;width:100%;position:static;order:-1}
          .gs-row{grid-template-columns:1fr 1fr}
        }
      `}</style>

      <div className="gs-main">
        <div className={box}>
          <p className={`mb-2 ${lab}`}>Template</p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(BLOCKS) as TemplateId[]).map(t => (
              <button key={t} onClick={() => setTemplate(t)} style={{ minHeight: 44 }}
                className={`rounded-md border px-3 text-left text-xs ${spec.template === t ? 'border-[#FF5722] bg-[#FF5722] font-bold text-white' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-100'}`}>
                <span className="block text-[10px] opacity-70">{t}</span>{TEMPLATE_NAMES[t]}
              </button>
            ))}
          </div>
          <label className="mt-3 flex flex-col gap-1"><span className={lab}>Load a preset</span>
            <select className={input} value="" onChange={e => loadPreset(e.target.value)} style={{ minHeight: 40 }}>
              <option value="">Choose a preset (six Game 1 scout graphics, seven On this day cards)…</option>
              {PRESETS.map(p => <option key={p.id} value={p.id}>{p.id} · {p.title}</option>)}
            </select>
          </label>
        </div>

        {!isOtd && <div className={box}>
          <p className={`mb-2 ${lab}`}>Auto-fill from the data · choose a game</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <input type="date" className={input} value={slateDate} onChange={e => e.target.value && setSlateDate(e.target.value)} style={{ minHeight: 40 }} />
            <select className={`${input} sm:col-span-2`} value={gamePk ?? ''} onChange={e => setGamePk(Number(e.target.value))} disabled={!slate.length} style={{ minHeight: 40 }}>
              {slate.map(g => <option key={g.gamePk} value={g.gamePk}>{g.label} · {g.away.pitcherName || 'TBD'} vs {g.home.pitcherName || 'TBD'}</option>)}
            </select>
          </div>
          {slateMsg && <p className="mt-1 text-[11px] text-stone-500">{slateMsg}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button className="gs-btn" disabled={!gamePk || filling} onClick={() => void fill('collision')}>{filling ? 'Filling…' : 'Starters head to head'}</button>
            <button className="gs-btn" disabled={!gamePk || filling} onClick={() => void fill('attack')}>{filling ? 'Filling…' : 'Attack map'}</button>
            <button className="gs-btn" disabled={!gamePk || filling} onClick={() => void fill('scoreboard')}>{filling ? 'Filling…' : 'Catchers and running'}</button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select className={input} value={side} onChange={e => setSide(e.target.value as 'away' | 'home')} style={{ minHeight: 40 }}>
              <option value="away">away starter</option><option value="home">home starter</option>
            </select>
            <button className="gs-btn" disabled={!gamePk || filling} onClick={() => void fill('pitcher')}>{filling ? 'Filling…' : 'Pitcher card'}</button>
          </div>
          <p className="mt-2 text-[11px] text-stone-500">Numbers come from the stored season data and are still editable. Anything the data does not have is left out, not guessed. The numbered list is editorial, so type or paste it.</p>
          {fillError && <p role="alert" className="mt-1 text-[11px] font-bold text-red-600">{fillError}</p>}
          {fillMissing.length > 0 && <p className="mt-1 text-[11px] text-stone-600">Not in the data, left out: {fillMissing.join(', ')}.</p>}
        </div>}

        <div className="flex w-fit overflow-hidden rounded-sm border border-stone-300 text-xs">
          {(['form', 'json'] as Mode[]).map(m => (
            <button key={m} onClick={() => setMode(m)} style={{ minHeight: 44 }} className={`px-5 ${mode === m ? 'bg-[#FF5722] font-bold text-white' : 'bg-white text-stone-700 hover:bg-stone-100'}`}>
              {m === 'form' ? 'Form' : 'JSON'}
            </button>
          ))}
        </div>

        {mode === 'json' ? (
          <div className={box}>
            <p className={`mb-2 ${lab}`}>Full spec · validated as you type</p>
            <textarea className={`${input} w-full`} rows={22} value={jsonText} onChange={e => onJson(e.target.value)} spellCheck={false} />
          </div>
        ) : isOtd ? (
          <OtdForm spec={spec} onChange={commit} />
        ) : (
          <>
            <div className={box}>
              <p className={`mb-2 ${lab}`}>Headline</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <input className={input} value={spec.kicker} onChange={e => patch({ kicker: e.target.value })} placeholder="Kicker (top right)" />
                <input className={input} value={spec.id} onChange={e => patch({ id: e.target.value.replace(/[^a-z0-9-]+/gi, '-').toLowerCase() })} placeholder="File name id" />
                <input className={`${input} sm:col-span-2 font-bold`} value={spec.title} onChange={e => patch({ title: e.target.value })} placeholder="Title" />
                <input className={`${input} sm:col-span-2`} value={spec.subtitle ?? ''} onChange={e => patch({ subtitle: e.target.value || undefined })} placeholder="Subtitle (optional)" />
              </div>
              <p className={`mb-1 mt-3 ${lab}`}>Chips · text only</p>
              <div className="flex flex-wrap gap-2">
                {spec.chips.map((c, i) => (
                  <div key={i} className="flex gap-1">
                    <input className={`${input} w-28`} value={c.text} onChange={e => patchChip(i, { text: e.target.value })} />
                    <select className={input} value={c.team} onChange={e => patchChip(i, { team: e.target.value as TeamKey })}>{TEAMS.map(t => <option key={t}>{t}</option>)}</select>
                    <button className="px-1 text-stone-400 hover:text-red-600" onClick={() => commit({ ...spec, chips: spec.chips.filter((_, j) => j !== i) })} title="Remove">×</button>
                  </div>
                ))}
                {spec.chips.length < 4 && <button className="text-[11px] text-stone-600 underline" onClick={() => commit({ ...spec, chips: [...spec.chips, { text: 'TB', team: 'TB' }] })}>+ new chip</button>}
              </div>
              <p className={`mb-1 mt-3 ${lab}`}>Find a headshot · search a player by name</p>
              <div className="flex flex-wrap gap-2">
                <input className={`${input} w-52`} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && void find()} placeholder="e.g. Misiorowski" />
                <button className="gs-btn" style={{ minHeight: 36 }} disabled={query.trim().length < 3 || searching} onClick={() => void find()}>{searching ? 'Searching…' : 'Search'}</button>
                <select className={input} value={target} onChange={e => setTarget(e.target.value)} title="Where the chosen player goes">
                  <option value="header">use as: header photo</option>
                  {spec.stats.map((st, i) => <option key={i} value={i}>use as: row {i + 1} · {st.label.slice(0, 22)}</option>)}
                </select>
              </div>
              {hits.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {hits.map(h => (
                    <button key={h.id} onClick={() => choosePlayer(h)} className="rounded-md border border-stone-300 bg-white px-2 py-1 text-left text-xs hover:bg-stone-100">
                      {h.name} <span className="text-stone-400">{h.pos}{h.active ? '' : ' · inactive'} · {h.id}</span>
                    </button>
                  ))}
                </div>
              )}
              {(spec.template === 'arsenal' || spec.template === 'contrast') && (
                <>
                  <p className={`mb-1 mt-3 ${lab}`}>Headshot · MLB player id (blank for none)</p>
                  <div className="flex gap-2">
                    <input className={`${input} w-40`} inputMode="numeric" value={spec.player?.id ?? ''} placeholder="607259"
                      onChange={e => { const id = Number(e.target.value.replace(/\D/g, '')); patch({ player: id ? { id, team: spec.player?.team } : undefined }) }} />
                    <select className={input} value={spec.player?.team ?? ''} disabled={!spec.player} onChange={e => spec.player && patch({ player: { ...spec.player, team: e.target.value || undefined } })}>
                      <option value="">ring colour: first chip</option>{TEAMS.filter(t => t !== 'neutral').map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                </>
              )}
              {(spec.template === 'arsenal' || spec.template === 'contrast' || spec.template === 'attack') && (
                <>
                  <p className={`mb-1 mt-3 ${lab}`}>Table column headings · one per extra cell</p>
                  <input className={`${input} w-full`} value={(spec.columns ?? []).join('; ')} onChange={e => patch({ columns: e.target.value.split(';').map(s => s.trim()).filter(Boolean) })} placeholder="Usage; Whiff; xwOBA" />
                </>
              )}
            </div>

            <div className={box}>
              <p className={`mb-2 ${lab}`}>Panels · tab text and a footnote under each</p>
              <div className="grid gap-2">
                {groups.map(g => (
                  <div key={g.group} className="grid items-center gap-2 sm:grid-cols-[70px_1fr_1.4fr]">
                    <span className="text-[11px] text-stone-500">{g.group}</span>
                    <input className={input} value={spec.panels?.[g.group] ?? ''} onChange={e => setMap('panels', g.group, e.target.value)} placeholder={g.title} />
                    <input className={input} value={spec.notes?.[g.group] ?? ''} onChange={e => setMap('notes', g.group, e.target.value)} placeholder="Footnote (optional)" />
                  </div>
                ))}
              </div>
            </div>

            <div className={box}>
              <p className={`mb-2 ${lab}`}>Paste list · replaces the rows of one group</p>
              {spec.template !== 'textlist' && (
                <select className={`${input} mb-2`} value={pasteGroup} onChange={e => setPasteGroup(e.target.value)} style={{ minHeight: 40 }}>
                  {groups.map(g => <option key={g.group} value={g.group}>{g.group}</option>)}
                </select>
              )}
              <textarea className={`${input} w-full`} rows={3} value={pasteText} onChange={e => setPasteText(e.target.value)}
                placeholder={spec.template === 'textlist' ? 'First headline (why it matters) | Second headline' : 'Brewers chase rate 26.7% (lowest in MLB) | Rays strikeout rate 18.7%'} />
              <div className="mt-2 flex items-center gap-3">
                <button className="gs-btn" onClick={applyPaste} disabled={!pasteText.trim()}>Apply list</button>
                {pasteMsg.length > 0 && <ul className="text-[11px] text-red-600">{pasteMsg.map(m => <li key={m}>{m}</li>)}</ul>}
              </div>
            </div>

            <div className={box}>
              <p className={`mb-2 ${lab}`}>Rows · {spec.stats.length}</p>
              <div className="flex flex-col gap-2">
                <div className="gs-row text-[10px] uppercase tracking-widest text-stone-400">
                  <span>group</span><span>label</span><span>value</span><span>sub</span><span>n</span><span>team</span><span />
                </div>
                {spec.stats.map((s, i) => (
                  <div key={i} className="rounded-md border border-stone-200 p-1.5">
                    <div className="gs-row">
                      <input className={input} list={`gs-groups-${spec.template}`} value={s.group ?? ''} onChange={e => patchStat(i, { group: e.target.value || undefined })} />
                      <input className={input} value={s.label} onChange={e => patchStat(i, { label: e.target.value })} />
                      <input className={`${input} font-bold`} value={s.value ?? ''} onChange={e => patchStat(i, { value: e.target.value || undefined })} />
                      <input className={input} value={s.sub ?? ''} onChange={e => patchStat(i, { sub: e.target.value || undefined })} />
                      <input className={input} inputMode="decimal" value={s.n ?? ''} onChange={e => patchStat(i, { n: e.target.value === '' || Number.isNaN(Number(e.target.value)) ? undefined : Number(e.target.value) })} />
                      <select className={input} value={s.team ?? ''} onChange={e => patchStat(i, { team: (e.target.value || undefined) as TeamKey | undefined })}>
                        <option value="" />{TEAMS.map(t => <option key={t}>{t}</option>)}
                      </select>
                      <button className="px-1 text-stone-400 hover:text-red-600" onClick={() => commit({ ...spec, stats: spec.stats.filter((_, j) => j !== i) })} title="Remove row" style={{ minHeight: 36 }}>×</button>
                    </div>
                    <div className="mt-1 grid gap-1 sm:grid-cols-2">
                      <input className={`${input}`} value={(s.cells ?? []).join('; ')} onChange={e => patchStat(i, { cells: e.target.value ? e.target.value.split(';').map(c => c.trim()) : undefined })} placeholder="Table cells, separated by ;  (leave blank for a dot)" />
                      <div className="flex gap-1">
                        <input className={`${input} w-16`} value={s.rank ?? ''} onChange={e => patchStat(i, { rank: e.target.value || undefined })} placeholder="rank" />
                        <input className={`${input} w-24`} inputMode="numeric" value={s.playerId ?? ''} onChange={e => { const id = Number(e.target.value.replace(/\D/g, '')); patchStat(i, { playerId: id || undefined }) }} placeholder="player id" title="MLB player id for a headshot on this row" />
                        <input className={`${input} w-24`} value={s.vs?.label ?? ''} onChange={e => patchStat(i, { vs: e.target.value || s.vs ? { label: e.target.value, value: s.vs?.value ?? '', n: s.vs?.n ?? 0 } : undefined })} placeholder="vs label" />
                        <input className={`${input} w-20`} value={s.vs?.value ?? ''} onChange={e => patchStat(i, { vs: s.vs ? { ...s.vs, value: e.target.value } : undefined })} placeholder="vs figure" />
                        <input className={`${input} w-14`} inputMode="decimal" value={s.vs?.n ?? ''} onChange={e => patchStat(i, { vs: s.vs ? { ...s.vs, n: Number(e.target.value) || 0 } : undefined })} placeholder="vs n" />
                      </div>
                    </div>
                  </div>
                ))}
                <datalist id={`gs-groups-${spec.template}`}>{groups.map(g => <option key={g.group} value={g.group} />)}</datalist>
              </div>
              <button className="mt-2 text-[11px] text-stone-600 underline" disabled={spec.stats.length >= 40}
                onClick={() => commit({ ...spec, stats: [...spec.stats, { group: groups[0].group, label: 'New stat', value: '0', ...(spec.template === 'textlist' ? { value: String(spec.stats.length + 1) } : {}) }] })}>+ new row</button>
            </div>
          </>
        )}

        {errors.length > 0 && (
          <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-[11px] text-red-700">
            <p className="mb-1 font-bold">Fix before exporting:</p>
            <ul className="list-disc pl-4">{errors.slice(0, 6).map(e => <li key={e}>{e}</li>)}</ul>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {(['landscape', 'portrait'] as SizeKey[]).map(s => (
            <button key={s} className="gs-btn" disabled={!canExport || exporting !== null} onClick={() => void exportPng(s)} data-export={s}>
              {exporting === s ? 'Exporting…' : isOtd ? `Download ${OTD_SIZES[s].label}` : `Download ${SIZES[s].w}x${SIZES[s].h}`}
            </button>
          ))}
          {exportError && <span className="text-[11px] text-red-600">{exportError}</span>}
          {isOtd && overflow.length > 0 && <p role="alert" className="w-full text-[11px] font-bold text-amber-700">Text is cut off in the {previewSize === 'portrait' ? '4:5' : '16:9'} card: {overflow.join(' · ')}. Shorten it or change the layout.</p>}
        </div>
      </div>

      <div className="gs-prev">
        <div className="mb-2 flex w-fit overflow-hidden rounded-sm border border-stone-300 text-xs">
          {(['landscape', 'portrait'] as SizeKey[]).map(s => (
            <button key={s} onClick={() => setPreviewSize(s)} style={{ minHeight: 36 }} className={`px-4 ${previewSize === s ? 'bg-[#FF5722] font-bold text-white' : 'bg-white text-stone-700 hover:bg-stone-100'}`}>{s}</button>
          ))}
        </div>
        <div ref={boxRef} style={{ width: '100%' }}>
          <div style={{ width: w * scale, height: h * scale, overflow: 'hidden', border: '1px solid #e7e2d8', borderRadius: 8, background: '#fff' }}>
            <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: w, height: h }}>
              <Block spec={spec} size={previewSize} images={images} />
            </div>
          </div>
        </div>
      </div>

      {/* Exact-size nodes for export, kept offscreen and never scaled. */}
      <div aria-hidden style={{ position: 'fixed', left: -20000, top: 0, pointerEvents: 'none' }}>
        {(['landscape', 'portrait'] as SizeKey[]).map(s => (
          <div key={s} ref={el => { exportRefs.current[s] = el }} style={{ width: SIZES[s].w, height: SIZES[s].h }}><Block spec={spec} size={s} images={images} /></div>
        ))}
      </div>
    </div>
  )
}
