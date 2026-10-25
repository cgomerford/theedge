// Two initials in a small circle. Replaces player headshots (we do not use MLB images).
// Styled like the site's other small chips: soft cream fill, thin line border, bold Red Hat text.
export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? '').replace(/[.,]/g, ' ').split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const suffix = /^(jr|sr|ii|iii|iv)$/i
  const words = parts.filter(p => !suffix.test(p))
  const use = words.length ? words : parts
  if (use.length === 1) return use[0].slice(0, 2).toUpperCase()
  return (use[0][0] + use[use.length - 1][0]).toUpperCase()
}

export default function InitialsChip({ name, size = 28, title }: { name: string | null | undefined; size?: number; title?: string }) {
  return (
    <span
      aria-hidden="true"
      title={title ?? name ?? undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: '50%',
        background: '#f1eee6',
        border: '1px solid #e7e2d8',
        color: '#1A1A1A',
        fontWeight: 800,
        fontSize: Math.max(12, Math.round(size * 0.4)),
        letterSpacing: '.02em',
        lineHeight: 1,
      }}
    >
      {initialsOf(name)}
    </span>
  )
}
