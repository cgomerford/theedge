// "Through 27 Sep 2026 · regular season". `date` should be the latest date in the data rows, not today.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function formatThrough(date: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? '')
  if (!m) return null
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`
}

export default function ThroughDate({ date, label = 'regular season' }: { date: string | null | undefined; label?: string }) {
  const text = formatThrough(date)
  if (!text) return null
  return <div style={{ fontSize: 12, color: '#8a8275' }}>Through {text}{label ? ` · ${label}` : ''}</div>
}
