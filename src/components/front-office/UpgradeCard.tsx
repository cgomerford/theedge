import UpgradePrompt from '@/components/pro/UpgradePrompt'

// Not Pro: nothing. (This used to be the locked-state card; upgrade prompts now live only in the page's one ProGate.)
export default function UpgradeCard({ title }: { title: string; features?: string[]; message?: string }) {
  return (
    <div>
      <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>{title}</div>
      <UpgradePrompt source="front_office" />
    </div>
  )
}
