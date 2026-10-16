// src/components/admin/story/season.ts
//
// Honest season label, no network. Looks for game dates already present in the
// rows passed in props (anything shaped `date`, `dates`, `gameDates`,
// `computed_date`). If the slate date is after the latest one, we say the data
// is regular-season-through-that-date; if no dates exist, just "Regular season".

const ISO = /^\d{4}-\d{2}-\d{2}/
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function collect(row: unknown, out: string[]) {
  if (!row || typeof row !== 'object') return
  const r = row as Record<string, unknown>
  for (const k of ['date', 'computed_date']) {
    const v = r[k]
    if (typeof v === 'string' && ISO.test(v)) out.push(v.slice(0, 10))
  }
  for (const k of ['dates', 'gameDates']) {
    const v = r[k]
    if (Array.isArray(v)) for (const d of v) if (typeof d === 'string' && ISO.test(d)) out.push(d.slice(0, 10))
  }
}

export function latestRowDate(rows: unknown[]): string | null {
  const dates: string[] = []
  for (const r of rows) collect(r, dates)
  return dates.length ? dates.sort().at(-1)! : null
}

/** "2026-09-27" → "27 Sep" */
function dayMonth(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]}`
}

export function seasonLabel(rows: unknown[], slateDate: string): string {
  const latest = latestRowDate(rows)
  if (!latest) return 'Regular season'
  if (slateDate > latest) return `Regular season · thru ${dayMonth(latest)}`
  return `${slateDate.slice(0, 4)} season`
}
