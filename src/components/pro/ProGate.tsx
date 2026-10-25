import { getViewerTier } from '@/lib/require-pro'
import { ProGateView } from './ProGateView'

// The ONE Pro gate a page may carry. Server component: the Pro check happens here, and for anyone without Pro the
// children are never rendered, so Pro data is never in their HTML (callers must also not FETCH Pro data unless
// the viewer is Pro; pass the heavy node as children, built lazily inside this tree).
//
//   pro     -> children
//   member  -> preview, then one plain row: the Pro line, the price, and the unlock button (goes to Stripe checkout)
//   anon    -> preview, then "Create a free account" (opens the signup form with `source`). No price.
//
// `preview` is the real component with its real labels and blank values. No fake chart, no fade to nothing.

export default async function ProGate(props: { feature: string; source: string; preview: React.ReactNode; children?: React.ReactNode }) {
  const tier = await getViewerTier()
  return <ProGateView tier={tier} {...props} />
}
