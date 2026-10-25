'use server'

// src/components/admin/story-v5/render-actions.ts
//
// Server actions for the render panel. Admin-only (src/proxy.ts guards /admin). They never render anything themselves: startRender writes
// a job folder and launches scripts/story-v5-render.ts as a detached background process, so a render never runs inside (or blocks) a request.
// One render at a time (the video encoder is heavy). Rendering needs Chrome and ffmpeg on THIS computer, so it is disabled on Vercel.
//
// Files live under story-v5-out/{gamePk}/{slateDate}/renders/{id}/ : x9lab-preview.mp4, contact-sheet.png, data.json, settings.json, status.json, render.log

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { FPS, MAX_FRAMES, layout } from './remotion/config'
import type { PreviewProps } from './remotion/Preview'

const ROOT = path.join(process.cwd(), 'story-v5-out')
const SAFE = /^[a-z0-9-]+$/i
export type RenderStatus = {
  id: string; gamePk: number; slateDate: string; state: 'running' | 'done' | 'failed' | 'queued'; stage: string; pct: number
  pid?: number; error?: string; startedAt?: string; finishedAt?: string; bytes?: number; files?: string[]
  spec?: { ok: boolean; issues: string[]; report: Record<string, unknown> }
}
export type StartResult = { ok: true; id: string } | { ok: false; error: string }

const jobsDir = (gamePk: number, date: string) => path.join(ROOT, String(gamePk), date, 'renders')
const alive = (pid: number) => { try { process.kill(pid, 0); return true } catch { return false } }
function readStatus(dir: string): RenderStatus | null {
  try {
    const s = JSON.parse(readFileSync(path.join(dir, 'status.json'), 'utf8')) as RenderStatus
    // a job whose process died without saying so is failed, never "running" forever
    if (s.state === 'running' && s.pid && !alive(s.pid)) return { ...s, state: 'failed', stage: 'failed', error: s.error ?? 'the render process stopped unexpectedly (see render.log)' }
    return s
  } catch { return null }
}
function anyRunning(): RenderStatus | null {
  if (!existsSync(ROOT)) return null
  for (const g of readdirSync(ROOT)) for (const d of existsSync(path.join(ROOT, g)) ? readdirSync(path.join(ROOT, g)) : []) {
    const rd = path.join(ROOT, g, d, 'renders')
    if (!existsSync(rd)) continue
    for (const id of readdirSync(rd)) { const s = readStatus(path.join(rd, id)); if (s?.state === 'running') return s }
  }
  return null
}

export async function startRender(gamePk: number, slateDate: string, props: PreviewProps): Promise<StartResult> {
  if (process.env.VERCEL) return { ok: false, error: 'Rendering runs on your own computer (it needs Chrome and the video encoder), not on Vercel.' }
  if (!Number.isInteger(gamePk) || !/^\d{4}-\d{2}-\d{2}$/.test(slateDate)) return { ok: false, error: 'bad game or date' }
  const { scenes, total } = layout(props.scenes ?? [])
  if (!scenes.length) return { ok: false, error: 'Tick at least one slide first.' }
  if (total > MAX_FRAMES) return { ok: false, error: `The video is ${(total / FPS).toFixed(1)} s. Switch a slide off to get under ${MAX_FRAMES / FPS} s.` }
  const busy = anyRunning()
  if (busy) return { ok: false, error: `A render is already running for game ${busy.gamePk} (${busy.stage}, ${busy.pct}%). Wait for it to finish.` }
  const id = `${Date.now().toString(36)}`
  const dir = path.join(jobsDir(gamePk, slateDate), id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'job.json'), JSON.stringify({ id, gamePk, slateDate, props, createdAt: new Date().toISOString() }))
  writeFileSync(path.join(dir, 'status.json'), JSON.stringify({ id, gamePk, slateDate, state: 'running', stage: 'starting', pct: 0 }))
  const log = openSync(path.join(dir, 'render.log'), 'a')
  const child = spawn(process.execPath, [path.join(process.cwd(), 'node_modules/tsx/dist/cli.mjs'), path.join(process.cwd(), 'scripts/story-v5-render.ts'), dir], {
    cwd: process.cwd(), detached: true, stdio: ['ignore', log, log], env: { ...process.env },
  })
  child.unref()
  if (child.pid) writeFileSync(path.join(dir, 'status.json'), JSON.stringify({ id, gamePk, slateDate, state: 'running', stage: 'starting', pct: 0, pid: child.pid }))
  return { ok: true, id }
}

export async function getRender(gamePk: number, slateDate: string, id: string): Promise<RenderStatus | null> {
  if (!SAFE.test(id) || !/^\d{4}-\d{2}-\d{2}$/.test(slateDate)) return null
  return readStatus(path.join(jobsDir(gamePk, slateDate), id))
}

export async function listRenders(gamePk: number, slateDate: string): Promise<RenderStatus[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(slateDate)) return []
  const rd = jobsDir(gamePk, slateDate)
  if (!existsSync(rd)) return []
  return readdirSync(rd).map(id => readStatus(path.join(rd, id))).filter((s): s is RenderStatus => !!s).sort((a, b) => b.id.localeCompare(a.id)).slice(0, 8)
}
