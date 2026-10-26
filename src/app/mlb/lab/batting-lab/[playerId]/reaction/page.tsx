// Batting Lab → Reaction Window. Pro only: a free account's daily deep look can never open it, and this page never claims one.
import { ProGateView } from '@/components/pro/ProGateView'
import { ArsenalZonesPreview } from '@/components/pro/previews'
import { getViewerTier } from '@/lib/require-pro'
import ReactionTab from './ReactionTab'

export default async function ReactionPage() {
  const tier = await getViewerTier()
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <ProGateView tier={tier} feature="Reaction Window" source="batting_reaction" preview={<ArsenalZonesPreview />} lockedLine="The Reaction Window is part of Pro.">
        {tier === 'pro' ? <ReactionTab /> : null}
      </ProGateView>
    </div>
  )
}
