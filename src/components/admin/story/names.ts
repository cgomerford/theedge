// src/components/admin/story/names.ts
//
// Suffix-aware name helpers. shortName is mirrored from
// src/lib/postgame/scorecard.ts L136-141 (not exported there, and we are not
// allowed to touch that file during the postseason). Keep the regex in sync.

const SUFFIX = /^(jr\.?|sr\.?|ii|iii|iv)$/i

/** "Fernando Tatis Jr." → "F. Tatis Jr." (mirror of scorecard.ts shortName) */
export function shortName(full: string): string {
  const parts = full.trim().split(/\s+/)
  if (parts.length < 2) return full
  const suffix = SUFFIX.test(parts[parts.length - 1]) && parts.length > 2 ? ` ${parts.pop()}` : ''
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}${suffix}`
}

/** "Fernando Tatis Jr." → "Tatis Jr."; single names pass through. */
export function surname(full: string): string {
  const s = shortName(full)
  return s === full ? full : s.replace(/^\S+\s/, '')
}

export function initials(full: string): string {
  const parts = full.trim().split(/\s+/).filter(p => !SUFFIX.test(p))
  if (parts.length === 0 || !parts[0]) return '?'
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
