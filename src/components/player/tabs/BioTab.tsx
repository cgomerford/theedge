import type { PlayerPageData } from '@/lib/player-page'

export default function BioTab({ data }: { data: PlayerPageData }) {
  const { identity, draft, schools, awards, transactions } = data
  const highschools = schools.filter(s => s.type === 'highschool')
  const colleges = schools.filter(s => s.type === 'college')

  return (
    <div className="grid md:grid-cols-2 gap-5">
      {/* ── Draft & amateur ───────────────────────────── */}
      <div className="bg-white border border-stone-200 rounded-xl p-5">
        <SectionLabel>Draft & amateur</SectionLabel>
        {draft ? (
          <div className="space-y-2 text-sm">
            <Row label="Year" value={String(draft.year)} />
            <Row label="Round" value={draft.round} />
            <Row label="Overall pick" value={draft.pickNumber != null ? `#${draft.pickNumber}` : '—'} />
            <Row label="Drafted by" value={draft.team ?? '—'} />
          </div>
        ) : (
          <p className="text-xs font-serif italic text-stone-400">
            No draft record — likely an international signing. Bonus and signing team aren't in the MLB API.
          </p>
        )}

        {(highschools.length > 0 || colleges.length > 0) && (
          <div className="mt-5 pt-5 border-t border-stone-100 space-y-3">
            {highschools.length > 0 && (
              <div>
                <div className="text-[9px] font-mono uppercase tracking-widest text-stone-400 mb-1">
                  High school
                </div>
                {highschools.map((s, i) => (
                  <div key={i} className="text-sm font-serif text-stone-800">
                    {s.name}{s.city ? ` — ${s.city}${s.state ? `, ${s.state}` : ''}` : ''}
                  </div>
                ))}
              </div>
            )}
            {colleges.length > 0 && (
              <div>
                <div className="text-[9px] font-mono uppercase tracking-widest text-stone-400 mb-1">
                  College
                </div>
                {colleges.map((s, i) => (
                  <div key={i} className="text-sm font-serif text-stone-800">
                    {s.name}{s.city ? ` — ${s.city}${s.state ? `, ${s.state}` : ''}` : ''}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Personal ──────────────────────────────────── */}
      <div className="bg-white border border-stone-200 rounded-xl p-5">
        <SectionLabel>Personal</SectionLabel>
        <div className="space-y-2 text-sm">
          <Row label="Born" value={formatBirthDate(identity.birthDate)} />
          <Row
            label="Birthplace"
            value={[identity.birthCity, identity.birthStateProvince, identity.birthCountry].filter(Boolean).join(', ') || '—'}
          />
          <Row label="Height" value={identity.height || '—'} />
          <Row label="Weight" value={identity.weight ? `${identity.weight} lb` : '—'} />
          <Row label="MLB debut" value={identity.mlbDebutDate ? formatBirthDate(identity.mlbDebutDate) : '—'} />
        </div>
      </div>

      {/* ── Awards ────────────────────────────────────── */}
      <div className="bg-white border border-stone-200 rounded-xl p-5">
        <SectionLabel>Awards</SectionLabel>
        {awards.length > 0 ? (
          <div className="space-y-1.5">
            {dedupeAwards(awards).map((a, i) => (
              <div key={i} className="flex items-baseline justify-between text-sm gap-3">
                <span className="font-serif text-stone-800">{a.name}</span>
                <span className="font-mono text-[10px] text-stone-500 tabular-nums shrink-0">
                  {a.season ?? formatYear(a.date)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs font-serif italic text-stone-400">
            No awards on record. Coverage is patchy for pre-2000 selections.
          </p>
        )}
      </div>

      {/* ── Recent transactions ───────────────────────── */}
      <div className="bg-white border border-stone-200 rounded-xl p-5">
        <SectionLabel>Recent transactions</SectionLabel>
        {transactions.length > 0 ? (
          <div className="space-y-2">
            {transactions.slice(0, 8).map(t => (
              <div key={t.id} className="text-xs">
                <div className="font-mono text-[10px] text-stone-400">
                  {formatBirthDate(t.date)} · {t.typeDesc}
                </div>
                <div className="font-serif text-stone-700 leading-snug">{t.description}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs font-serif italic text-stone-400">No recorded transactions.</p>
        )}
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-4">
      ⊕ {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[10px] font-mono uppercase tracking-widest text-stone-400 shrink-0">{label}</span>
      <span className="font-mono font-semibold text-stone-900 text-sm text-right">{value}</span>
    </div>
  )
}

function formatBirthDate(date: string): string {
  if (!date) return '—'
  const d = new Date(date)
  if (isNaN(d.getTime())) return date
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatYear(date: string): string {
  if (!date) return '—'
  return date.slice(0, 4)
}

function dedupeAwards(awards: PlayerPageData['awards']): PlayerPageData['awards'] {
  // Collapse repeat awards (e.g. 5x All-Star) into a single row with a count
  const grouped = new Map<string, PlayerPageData['awards']>()
  for (const a of awards) {
    const existing = grouped.get(a.name) ?? []
    grouped.set(a.name, [...existing, a])
  }
  const out: PlayerPageData['awards'] = []
  for (const [name, group] of grouped) {
    if (group.length === 1) {
      out.push(group[0])
    } else {
      const years = group.map(g => g.season ?? formatYear(g.date)).filter(Boolean).sort()
      out.push({
        id: group[0].id,
        name: `${name} (${group.length}x)`,
        date: group[0].date,
        season: years.join(', '),
      })
    }
  }
  return out.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
}