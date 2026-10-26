import { FOUNDING } from '@/lib/pricing'
import type { ViewerTier } from '@/lib/require-pro-types'
import ProCheckoutButton from './ProCheckoutButton'
import CreateAccountButton from './CreateAccountButton'

// Client-safe half of the gate (no server imports), so client components that already know the viewer's state can use it.
// See ProGate.tsx for the server component that works the state out (and spends the free deep look).
//
//   tier 'pro'    -> children. With freeLook, one muted line above them: "Your free deep look for today. Pro opens every one."
//   tier 'member' -> the shell (real labels, no numbers), then "Your free deep look today is used." and the upgrade button
//   tier 'anon'   -> the shell, then "Free account: open one full deep look a day." and "Create account". No price.

export const FREE_LOOK_NOTE = 'Your free deep look for today. Pro opens every one.'
export const USED_LINE = 'Your free deep look today is used.'
export const ANON_LINE = 'Free account: open one full deep look a day.'
export const UNLOCK_LABEL = `Unlock with Founding Pro, £${FOUNDING.price}/yr`

export function ProGateView({
  tier, feature, source, preview, freeLook = false, children,
}: {
  tier: ViewerTier
  feature: string
  source: string
  preview: React.ReactNode
  freeLook?: boolean
  children?: React.ReactNode
}) {
  if (tier === 'pro') {
    return (
      <>
        {freeLook && <p style={{ margin: '0 0 10px', fontSize: 13, color: '#8a8275' }}>{FREE_LOOK_NOTE}</p>}
        {children}
      </>
    )
  }
  return (
    <section aria-label={feature}>
      <div>{preview}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 20px', borderTop: '1px solid #e7e2d8', borderBottom: '1px solid #e7e2d8', padding: '14px 0', marginTop: 12 }}>
        {tier === 'member' ? (
          <>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#1A1A1A' }}>{USED_LINE}</span>
            <ProCheckoutButton>{UNLOCK_LABEL}</ProCheckoutButton>
          </>
        ) : (
          <>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#1A1A1A' }}>{ANON_LINE}</span>
            <CreateAccountButton source={source} label="Create account" accent />
          </>
        )}
      </div>
    </section>
  )
}
