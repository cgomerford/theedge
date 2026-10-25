// scripts/story-v5-render.ts
//
// Background render job for the v5 video. Started by the admin page (render-actions.ts), never run inside a web request.
//   npx tsx scripts/story-v5-render.ts <jobDir>
// <jobDir>/job.json holds { id, gamePk, slateDate, props } (props = the PreviewProps the Player shows). Progress is written to
// <jobDir>/status.json. Outputs, next to each other: x9lab-preview.mp4, contact-sheet.png, data.json (the numbers used), settings.json.
// Steps: bundle -> render H.264 yuv420p 30 fps no audio -> inspect the MP4 (repair faststart if needed) -> contact sheet -> done.

import { bundle } from '@remotion/bundler'
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { FPS, HEIGHT, MAX_FRAMES, WIDTH, layout } from '../src/components/admin/story-v5/remotion/config'
import { inspectMp4, makeFaststart, specIssues } from '../src/components/admin/story-v5/mp4check'

// Use the Chrome installed on this Mac: Remotion's own downloaded copy fails to open on some setups ("Target closed").
// STORY_V5_CHROME overrides the path; STORY_V5_CHROME=none uses Remotion's own copy.
const SYSTEM_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const chrome = process.env.STORY_V5_CHROME ?? (existsSync(SYSTEM_CHROME) ? SYSTEM_CHROME : undefined)
const browser = chrome && chrome !== 'none' ? { browserExecutable: chrome, chromeMode: 'chrome-for-testing' as const } : {}

const dir = process.argv[2]
if (!dir || !existsSync(path.join(dir, 'job.json'))) { console.error('usage: story-v5-render.ts <jobDir>'); process.exit(2) }
const job = JSON.parse(readFileSync(path.join(dir, 'job.json'), 'utf8')) as { id: string; gamePk: number; slateDate: string; props: { data: unknown; scenes: string[] } & Record<string, unknown> }
const statusPath = path.join(dir, 'status.json')
type Status = Record<string, unknown>
let status: Status = { id: job.id, gamePk: job.gamePk, slateDate: job.slateDate, state: 'running', stage: 'starting', pct: 0, pid: process.pid, startedAt: new Date().toISOString() }
const save = (patch: Status = {}) => { status = { ...status, ...patch, updatedAt: new Date().toISOString() }; writeFileSync(statusPath, JSON.stringify(status, null, 1)) }

async function main() {
  const { scenes, total } = layout(job.props.scenes as never)
  if (!scenes.length) throw new Error('no slides selected')
  if (total > MAX_FRAMES) throw new Error(`video is ${total} frames, over the ${MAX_FRAMES} frame (${MAX_FRAMES / FPS} s) limit`)
  writeFileSync(path.join(dir, 'data.json'), JSON.stringify(job.props.data, null, 2))
  const { data: _data, ...settings } = job.props; void _data
  writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ ...settings, frames: total, seconds: total / FPS }, null, 2))

  save({ stage: 'bundling the video code', pct: 2 })
  const serveUrl = await bundle({ entryPoint: path.resolve('src/components/admin/story-v5/remotion/index.ts'), onProgress: p => save({ stage: 'bundling the video code', pct: 2 + Math.round(p * 0.08) }) })
  const port = 3400 + Math.floor(Math.random() * 500)                 // never the Next dev server's 3000
  const chromiumOptions = { gl: 'angle' as const }

  save({ stage: 'preparing', pct: 11 })
  const composition = await selectComposition({ serveUrl, id: 'Preview', inputProps: job.props, port, chromiumOptions, ...browser })
  if (composition.durationInFrames !== total) throw new Error(`composition has ${composition.durationInFrames} frames, expected ${total}`)

  const mp4 = path.join(dir, 'x9lab-preview.mp4')
  let last = 0
  await renderMedia({
    composition, serveUrl, codec: 'h264', outputLocation: mp4, inputProps: job.props, pixelFormat: 'yuv420p', muted: true, port, chromiumOptions, ...browser,
    onProgress: p => { const now = Date.now(); if (now - last > 800) { last = now; save({ stage: `rendering frame ${p.renderedFrames} of ${total}`, pct: 12 + Math.round(p.progress * 76) }) } },
  })

  save({ stage: 'checking the MP4', pct: 90 })
  let bytes: Uint8Array = new Uint8Array(readFileSync(mp4))
  let report = inspectMp4(bytes)
  if (!report.faststart) { bytes = makeFaststart(bytes); writeFileSync(mp4, bytes); report = inspectMp4(bytes) }
  const issues = specIssues(report, { width: WIDTH, height: HEIGHT, fps: FPS, frames: total })

  save({ stage: 'making the contact sheet', pct: 94 })
  const sheet = await selectComposition({ serveUrl, id: 'Sheet', inputProps: job.props, port, chromiumOptions, ...browser })
  await renderStill({ composition: sheet, serveUrl, output: path.join(dir, 'contact-sheet.png'), inputProps: job.props, port, chromiumOptions, ...browser, frame: 0 })

  save({ state: 'done', stage: 'done', pct: 100, finishedAt: new Date().toISOString(), spec: { report, issues, ok: issues.length === 0 }, bytes: bytes.byteLength, files: ['x9lab-preview.mp4', 'contact-sheet.png', 'data.json', 'settings.json'] })
}

const CHROME_HINT = ` Chrome could not open (tried: ${chrome ?? "Remotion's own copy"}). Make sure Google Chrome is installed in /Applications, or set STORY_V5_CHROME to its path. To test Chrome alone: npx tsx scripts/story-v5-stills.ts <data.json> <outDir> 30`
main().catch(e => { console.error(e); const m = (e as Error).message; save({ state: 'failed', stage: 'failed', error: /Target closed|target-closed|Could not find|browser/i.test(m) ? m.split('\n')[0] + CHROME_HINT : m, finishedAt: new Date().toISOString() }); process.exit(1) })
