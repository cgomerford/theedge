import { FOUNDING } from '@/lib/pricing'
import type { ViewerTier } from '@/lib/require-pro-types'
import ProCheckoutButton from './ProCheckoutButton'
import CreateAccountButton from './CreateAccountButton'
import OpenLookButton from './OpenLookButton'
import LabAnonLine from './LabAnonLine'

// Client-safe half of the gate (no server imports), so client components that already know the viewer's state can use it.
// See ProGate.tsx for the server component that works the state out.
//
//   tier 'pro'    -> children. With freeLook, one muted line above them.
//   tier 'member' -> the shell (real labels, no numbers), then either "open your free deep look" (openable) or "look used" + upgrade.
//   tier 'anon'   -> the shell, then the signed-out line and "Create account". No price. (`noButton`: signed-in but the look table is unavailable.)

// Wording below is placeholder copy from the brief: [George: look-left line / open-look line / look-used line / upgrade button / signed-out line / signup button]
export const FREE_LOOK_NOTE = 'Your free deep look for today. Pro opens every one.'
export const OPEN_LINE = 'Open your free deep look for today'
export const USED_LINE = 'Your free deep look today is used.'
export const ANON_LINE = 'Create a free account to open one full look a day.'
export const UNLOCK_LABEL = `Unlock with Founding Pro, £${FOUNDING.price}/yr`
export const SIGNUP_LABEL = 'Create account'

export type Openable = { feature: string; entityId: string }

export type LabWho = { lab: 'batting' | 'pitching'; name: string }

export function ProGateRow({ tier, source, openable, noButton, lockedLine, who }: { tier: Exclude<ViewerTier, 'pro'>; source: string; openable?: Openable; noButton?: boolean; lockedLine?: string; who?: LabWho }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 20px', borderTop: '1px solid #e7e2d8', borderBottom: '1px solid #e7e2d8', padding: '14px 0', marginTop: 12 }}>
      {tier === 'member' && openable ? (
        <>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#1A1A1A' }}>One full look a day, free.</span>
          <OpenLookButton feature={openable.feature} entityId={openable.entityId}>{OPEN_LINE}</OpenLookButton>
        </>
      ) : tier === 'member' ? (
        <>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#1A1A1A' }}>{lockedLine ?? USED_LINE}</span>
          <ProCheckoutButton>{UNLOCK_LABEL}</ProCheckoutButton>
        </>
      ) : (
        <>
          {who ? <LabAnonLine lab={who.lab} name={who.name} /> : <span style={{ fontSize: 15, fontWeight: 700, color: '#1A1A1A' }}>{ANON_LINE}</span>}
          {!noButton && <CreateAccountButton source={source} label={SIGNUP_LABEL} accent />}
        </>
      )}
    </div>
  )
}

export function ProGateView({
  tier, feature, source, preview, freeLook = false, openable, noButton, lockedLine, children,
}: {
  tier: ViewerTier
  feature: string
  source: string
  preview: React.ReactNode
  freeLook?: boolean
  openable?: Openable
  noButton?: boolean
  /** replaces the "look used" line for modules a free look can never open (Pro only) */
  lockedLine?: string
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
      <ProGateRow tier={tier} source={source} openable={openable} noButton={noButton} lockedLine={lockedLine} />
    </section>
  )
}
