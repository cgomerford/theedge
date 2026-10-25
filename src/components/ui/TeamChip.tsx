// Team abbreviation as plain text in a small square chip (e.g. "MIL"). Replaces team logos.
export default function TeamChip({ abbr, title }: { abbr: string | null | undefined; title?: string }) {
  return (
    <span
      title={title}
      style={{
        display: 'inline-block',
        flexShrink: 0,
        padding: '2px 6px',
        borderRadius: 4,
        background: '#f1eee6',
        border: '1px solid #e7e2d8',
        color: '#1A1A1A',
        fontWeight: 800,
        fontSize: 12,
        letterSpacing: '.04em',
        lineHeight: 1.3,
      }}
    >
      {(abbr ?? '').toUpperCase() || '—'}
    </span>
  )
}
