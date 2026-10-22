// src/app/mlb/lab/batting-lab/[playerId]/layout.tsx
//
// SERVER layout: the SIGN-UP gate for every /mlb/lab/batting-lab/[playerId]/* page. The lab UI itself (LabShell.tsx —
// the client layout with the header and tab bar) only renders for signed-up members; a signed-out visitor gets the
// sign-up card and none of the lab's client code or data requests run.
//
// Pro is NOT decided here any more. The tabs that were Pro before the Nerve Centre restructure (Overview, Vs Arsenal,
// Location Lab, Hot Zone Overlay, Sequencing, Trends, H2H) live in the (pro) route group, whose layout keeps the Pro
// gate exactly as it was; Contact and the other Nerve Centre tabs sit outside it, open to any signed-up member. The lab's
// Pro data APIs are gated separately (lib/require-pro.ts), so bypassing a page does not reach that data either.

import { isSignedIn } from '@/lib/require-signup'
import SignUpGate from '@/components/SignUpGate'
import LabShell from './LabShell'

export default async function BattingLabGate({ children }: { children: React.ReactNode }) {
  if (!(await isSignedIn())) {
    return <SignUpGate
      title="Sign up to open the Batting Lab"
      blurb="How a hitter makes contact, where the ball goes, and the choices he makes pitch by pitch, with the sample behind every number."
      features={['Contact quality and spray direction for every hitter', 'Approach: the count ladder and zone-versus-chase swing rates', 'The league Contact Engine and leaderboards']}
    />
  }
  return <LabShell>{children}</LabShell>
}
