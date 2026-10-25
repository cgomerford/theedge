// src/app/admin/story-v5/files/route.ts
//
// Download / preview a file from a finished render: GET /admin/story-v5/files?game=&date=&job=&name=
// Under /admin, so src/proxy.ts basic auth guards it. Only four fixed file names are served and every id is checked, so no path can escape
// the render folder. The MP4 supports Range requests so the browser can play and scrub it.

import { createReadStream, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { NextRequest, NextResponse } from 'next/server'

const TYPES: Record<string, string> = { 'x9lab-preview.mp4': 'video/mp4', 'contact-sheet.png': 'image/png', 'data.json': 'application/json', 'settings.json': 'application/json' }

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams
  const game = q.get('game') ?? '', date = q.get('date') ?? '', job = q.get('job') ?? '', name = q.get('name') ?? ''
  if (!/^\d+$/.test(game) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^[a-z0-9-]+$/i.test(job) || !(name in TYPES)) return new NextResponse('Not found', { status: 404 })
  const file = path.join(process.cwd(), 'story-v5-out', game, date, 'renders', job, name)
  if (!existsSync(file)) return new NextResponse('Not found', { status: 404 })
  const size = statSync(file).size
  const headers: Record<string, string> = { 'Content-Type': TYPES[name], 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', 'Content-Disposition': `${q.get('download') ? 'attachment' : 'inline'}; filename="x9lab-${game}-${name}"` }
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') ?? '')
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]))
    const end = range[1] && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1
    if (start > end || start >= size) return new NextResponse(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
    return new NextResponse(Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream, { status: 206, headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) } })
  }
  return new NextResponse(Readable.toWeb(createReadStream(file)) as ReadableStream, { headers: { ...headers, 'Content-Length': String(size) } })
}
