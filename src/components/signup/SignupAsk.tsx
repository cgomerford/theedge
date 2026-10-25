import { getCurrentSubscriber } from '@/lib/auth'
import SignupAskButton from './SignupAskButton'

// Server component: shows the inline ask to signed-out visitors only. Put at most ONE on a page.
export default async function SignupAsk({ source }: { source: string }) {
  if (await getCurrentSubscriber()) return null
  return <SignupAskButton source={source} />
}
