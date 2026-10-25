export default function PendingBlock({ label }: { label: string }) {
  return <div style={{ padding: '10px 0', fontSize: 13, color: '#8a8275', borderTop: '1px solid #e7e2d8' }}>Pending: {label}</div>
}
