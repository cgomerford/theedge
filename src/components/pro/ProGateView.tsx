import { foundingThenMonthly } from '@/lib/pricing'
import type { ViewerTier } from '@/lib/require-pro-types'
import ProCheckoutButton from './ProCheckoutButton'
import CreateAccountButton from './CreateAccountButton'

// Client-safe half of the gate (no server imports), so client components that already know the viewer's tier can use it.
// See ProGate.tsx for the server component that works the tier out.

export const PRO_LINE = '[George: Pro line for this feature]'
export const UNLOCK_WORDING = '[George: Unlock wording]'

export function ProGateView({
  tier, feature, source, preview, children,
}: {
  tier: ViewerTier
  feature: string
  source: string
  preview: React.ReactNode
  children?: React.ReactNode
}) {
  if (tier === 'pro') return <>{children}</>
  return (
    <section aria-label={feature}>
      <div>{preview}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 20px', borderTop: '1px solid #e7e2d8', borderBottom: '1px solid #e7e2d8', padding: '14px 0', marginTop: 12 }}>
        {tier === 'member' ? (
          <>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#1A1A1A' }}>{PRO_LINE}</span>
            <span style={{ fontSize: 15, color: '#5b5347', fontVariantNumeric: 'tabular-nums' }}>{foundingThenMonthly()}</span>
            <ProCheckoutButton>{UNLOCK_WORDING}</ProCheckoutButton>
          </>
        ) : (
          <CreateAccountButton source={source} />
        )}
      </div>
    </section>
  )
}
