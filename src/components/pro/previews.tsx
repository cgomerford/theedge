// Previews shown inside ProGate to people without Pro: the real labels with blank values.
// No fake chart, no made-up numbers, no fade to nothing. Values are left empty on purpose.

const TH: React.CSSProperties = { textAlign: 'left', fontSize: 12, fontWeight: 800, letterSpacing: '.04em', color: '#8a8275', padding: '8px 10px', borderBottom: '1px solid #e7e2d8', whiteSpace: 'nowrap' }
const TD: React.CSSProperties = { padding: '10px', borderBottom: '1px solid #e7e2d8', minWidth: 64, fontVariantNumeric: 'tabular-nums' }
const TITLE: React.CSSProperties = { margin: '0 0 8px', fontSize: 13, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: '#FF5722' }

const PITCHES = ['Four-seam fastball', 'Sinker', 'Cutter', 'Slider', 'Curveball', 'Changeup', 'Splitter']

/** Arsenal table: one row per pitch type, the real column labels, blank values. */
export function ArsenalPreview({ title = 'Arsenal' }: { title?: string }) {
  const cols = ['Pitch', 'Velo', 'Usage', 'Whiff %', 'xwOBA against', 'Pitches (n)']
  return (
    <div>
      <h3 style={TITLE}>{title}</h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead><tr>{cols.map(c => <th key={c} scope="col" style={TH}>{c}</th>)}</tr></thead>
          <tbody>
            {PITCHES.map(p => (
              <tr key={p}>
                <th scope="row" style={{ ...TD, textAlign: 'left', fontSize: 14, fontWeight: 700, color: '#1A1A1A', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: '#FAF8F3' }}>{p}</th>
                {cols.slice(1).map(c => <td key={c} style={TD} aria-label={`${p} ${c}: not shown`} />)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const ROWS = ['Up', 'Middle', 'Down']
const COLS = ['Inside', 'Middle', 'Away']

/** Strike-zone grid: the nine zone labels, blank values. */
export function ZonesPreview({ title = 'Zones' }: { title?: string }) {
  return (
    <div>
      <h3 style={TITLE}>{title}</h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr><th style={TH} />{COLS.map(c => <th key={c} scope="col" style={TH}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {ROWS.map(r => (
              <tr key={r}>
                <th scope="row" style={{ ...TD, textAlign: 'left', fontSize: 13, fontWeight: 700 }}>{r}</th>
                {COLS.map(c => <td key={c} style={{ ...TD, minWidth: 88, height: 44, border: '1px solid #e7e2d8' }} aria-label={`${r} ${c}: not shown`} />)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** A named block of labelled rows with blank values, for tabs that are neither a pitch table nor a zone grid. */
export function LabelledRowsPreview({ title, labels }: { title: string; labels: string[] }) {
  return (
    <div>
      <h3 style={TITLE}>{title}</h3>
      {labels.map(l => (
        <div key={l} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderTop: '1px solid #e7e2d8', fontSize: 14 }}>
          <span style={{ fontWeight: 700 }}>{l}</span>
          <span aria-label={`${l}: not shown`} style={{ minWidth: 80 }} />
        </div>
      ))}
    </div>
  )
}

/** Arsenal and zones together, for pages with both. */
export function ArsenalZonesPreview() {
  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <ArsenalPreview />
      <ZonesPreview />
    </div>
  )
}

/** Table with real column labels and named rows, blank values (no numbers). */
export function TablePreview({ title, cols, rows }: { title: string; cols: string[]; rows: string[] }) {
  return (
    <div>
      <h3 style={TITLE}>{title}</h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead><tr>{cols.map((c, i) => <th key={c} scope="col" style={{ ...TH, ...(i === 0 ? { position: 'sticky', left: 0, background: '#FAF8F3' } : null) }}>{c}</th>)}</tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r}>
                <th scope="row" style={{ ...TD, textAlign: 'left', fontSize: 14, fontWeight: 700, color: '#1A1A1A', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: '#FAF8F3' }}>{r}</th>
                {cols.slice(1).map(c => <td key={c} style={TD} aria-label={`${r} ${c}: not shown`} />)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** An empty chart frame with its axis titles, no line and no values. */
export function ChartFramePreview({ title, x, y }: { title: string; x: string; y: string }) {
  return (
    <div>
      <h3 style={TITLE}>{title}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 8, alignItems: 'stretch' }}>
        <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: 12, fontWeight: 800, color: '#8a8275', textAlign: 'center' }}>{y}</div>
        <div style={{ height: 180, border: '1px solid #e7e2d8', borderTop: 0, borderRight: 0 }} />
      </div>
      <div style={{ fontSize: 12, fontWeight: 800, color: '#8a8275', textAlign: 'center', marginTop: 6 }}>{x}</div>
    </div>
  )
}
