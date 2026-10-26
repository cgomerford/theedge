import { resolveViewer } from '@/lib/gate'
import { ProGateView } from './ProGateView'

// The ONE Pro gate a page may carry (server component). It checks the viewer, spends the free deep look when it is used, and
// for anyone without access never renders the children, so Pro data is not in their HTML (callers must not FETCH it either:
// build heavy children inside this tree). `lookKey` identifies the module (for example a player id) so re-opening it
// the same day costs nothing.

export default async function ProGate(props: { feature: string; source: string; lookKey: string; preview: React.ReactNode; children?: React.ReactNode }) {
  const { lookKey, ...rest } = props
  const { tier, freeLook } = await resolveViewer(rest.source, lookKey)
  return <ProGateView tier={tier} freeLook={freeLook} {...rest} />
}
