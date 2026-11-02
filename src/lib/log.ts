// src/lib/log.ts
//
// One quiet logger for server and client code (no dependencies). In production only errors print, so Vercel's runtime logs stay small;
// everywhere else (next dev, tests) everything prints. Nothing needs configuring:
//   LOG_LEVEL=debug|info|warn|error|silent   overrides the default (server only; the browser always uses the default)
//   DEBUG_LOGS=1                             forces debug, handy for a short look at production
// Every call prints ONE line: "[prefix] message: detail". detail is an Error's message or a short string, cut to 300 characters.
// Never pass a whole API payload; this logger never JSON.stringifies anything.

type Level = 'debug' | 'info' | 'warn' | 'error' | 'silent'
const RANK: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 }
const MAX_DETAIL = 300

function level(): Level {
  const env = typeof process !== 'undefined' ? process.env : undefined
  if (env?.DEBUG_LOGS === '1') return 'debug'
  const set = env?.LOG_LEVEL as Level | undefined
  if (set && set in RANK) return set
  return env?.NODE_ENV === 'production' ? 'error' : 'debug'
}

function detailText(detail: unknown): string {
  if (detail == null) return ''
  let t: string
  if (detail instanceof Error) t = detail.message
  else if (typeof detail === 'string') t = detail
  else if (typeof detail === 'number' || typeof detail === 'boolean') t = String(detail)
  else if (typeof detail === 'object' && typeof (detail as { message?: unknown }).message === 'string') t = (detail as { message: string }).message
  else t = '(object not shown)'
  t = t.replace(/\s+/g, ' ').trim()
  return t.length > MAX_DETAIL ? `${t.slice(0, MAX_DETAIL)}…` : t
}

function line(prefix: string, message: string, detail?: unknown): string {
  const d = detailText(detail)
  return `[${prefix}] ${message}${d ? `: ${d}` : ''}`
}

function emit(at: Exclude<Level, 'silent'>, prefix: string, message: string, detail?: unknown) {
  if (RANK[at] < RANK[level()]) return
  console[at](line(prefix, message, detail))
}

export const log = {
  debug: (prefix: string, message: string, detail?: unknown) => emit('debug', prefix, message, detail),
  info: (prefix: string, message: string, detail?: unknown) => emit('info', prefix, message, detail),
  warn: (prefix: string, message: string, detail?: unknown) => emit('warn', prefix, message, detail),
  error: (prefix: string, message: string, detail?: unknown) => emit('error', prefix, message, detail),
}

const seen = new Map<string, { at: number; hidden: number }>()
const WINDOW_MS = 60_000

/** An error line for a failure that repeats (a page that fails on every request): prints once, then stays quiet for 60 s and says how many it hid on the next print. Per process. */
export function logOnce(key: string, prefix: string, message: string, detail?: unknown) {
  const now = Date.now()
  const s = seen.get(key)
  if (s && now - s.at < WINDOW_MS) { s.hidden += 1; return }
  const hidden = s?.hidden ?? 0
  seen.set(key, { at: now, hidden: 0 })
  if (seen.size > 500) for (const [k, v] of seen) if (now - v.at >= WINDOW_MS) seen.delete(k)
  emit('error', prefix, hidden > 0 ? `${message} (repeated ${hidden} times)` : message, detail)
}

/** For tests: forget what logOnce has seen. */
export function resetLogOnce() { seen.clear() }
