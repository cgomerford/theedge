// scripts/story-v5-stills.ts
//
// Renders stills of the v5 composition at chosen frames so the scenes can be checked by eye. Admin tool, local only.
//   npx tsx scripts/story-v5-stills.ts <data.json> <outDir> [frame ...]
// Uses the bundler + renderer installed for the video; data.json is a saved buildPreviewData() result.

import { bundle } from '@remotion/bundler'
import { renderStill, selectComposition } from '@remotion/renderer'
import { readFileSync, mkdirSync } from 'node:fs'
import { existsSync } from 'node:fs'
import path from 'node:path'

const SYSTEM_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
// Prefer the Chrome installed on this Mac (set STORY_V5_CHROME to choose another, or STORY_V5_CHROME=none for Remotion's own copy).
const chrome = process.env.STORY_V5_CHROME ?? (existsSync(SYSTEM_CHROME) ? SYSTEM_CHROME : undefined)
const browser = chrome && chrome !== 'none' ? { browserExecutable: chrome, chromeMode: 'chrome-for-testing' as const } : {}

async function main() {
  const [dataPath, outDir, ...frames] = process.argv.slice(2)
  if (!dataPath || !outDir) { console.error('usage: story-v5-stills.ts <data.json> <outDir> [frame ...]'); process.exit(2) }
  const data = JSON.parse(readFileSync(dataPath, 'utf8'))
  mkdirSync(outDir, { recursive: true })
  const serveUrl = await bundle({ entryPoint: path.resolve('src/components/admin/story-v5/remotion/index.ts'), onProgress: () => {} })
  const inputProps = { data, theme: process.env.THEME === 'dark' ? 'dark' : 'paper', defenseMode: process.env.DEFENSE ?? 'home', bullpenMode: process.env.BULLPEN ?? 'lastGame' }
  const composition = await selectComposition({ serveUrl, id: 'Preview', inputProps, port: 3400, ...browser, chromiumOptions: { gl: (process.env.GL as 'angle' | 'swangle' | undefined) ?? 'angle' }, logLevel: (process.env.LOG as 'verbose' | undefined) ?? 'warn' })
  for (const f of (frames.length ? frames : ['60']).map(Number)) {
    const output = path.join(outDir, `frame-${String(f).padStart(3, '0')}.png`)
    await renderStill({ composition, serveUrl, output, frame: f, inputProps, port: 3400, ...browser, chromiumOptions: { gl: (process.env.GL as 'angle' | 'swangle' | undefined) ?? 'angle' }, logLevel: (process.env.LOG as 'verbose' | undefined) ?? 'warn' })
    console.log('wrote', output)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
