export default function SmallSample({ n }: { n: number | null | undefined }) {
  return <span style={{ fontSize: 12, color: '#8a8275' }}>Small sample (n = {(n ?? 0).toLocaleString('en-US')})</span>
}
