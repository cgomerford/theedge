// Development only: saves one recorded answer for the lab previews (see lib/lab-demo-fetch.ts). Does nothing in production.
import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

// Writes are queued one at a time: several previews record in parallel and would otherwise overwrite each other.
let queue: Promise<unknown> = Promise.resolve()

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV !== 'development') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { lab, key, body } = (await req.json()) as { lab?: string; key?: string; body?: unknown }
  if ((lab !== 'batting' && lab !== 'pitching') || typeof key !== 'string' || body === undefined) return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  const file = path.join(process.cwd(), 'src/data/lab-demo', `${lab}.json`)
  queue = queue.then(async () => {
    const cur = JSON.parse(await fs.readFile(file, 'utf8').catch(() => '{}') || '{}') as Record<string, unknown>
    cur[key] = body
    await fs.writeFile(file, JSON.stringify(cur))
  }).catch(e => console.error('[lab-demo-record]', e))
  await queue
  return NextResponse.json({ ok: true })
}
