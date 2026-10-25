import SmallSample from './SmallSample'

// A stat value with its sample size under it. Pass `min` to swap in "Small sample (n = X)" below the minimum.
export default function StatN({ value, n, label, min }: { value: string | number | null | undefined; n: number | null | undefined; label?: string; min?: number }) {
  const small = n == null || (min != null && n < min)
  return (
    <div>
      {label && <div style={{ fontSize: 12, fontWeight: 700, color: '#8a8275' }}>{label}</div>}
      {small || value == null || value === '' ? (
        <SmallSample n={n} />
      ) : (
        <>
          <div style={{ fontSize: 22, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
          <div style={{ fontSize: 12, color: '#8a8275', fontVariantNumeric: 'tabular-nums' }}>n {n.toLocaleString('en-US')}</div>
        </>
      )}
    </div>
  )
}
