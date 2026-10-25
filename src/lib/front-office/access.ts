// src/lib/front-office/access.ts
//
// ONE place the Front Office pages resolve "is this viewer Pro?". Same rule as
// the team page: the real subscriber flag; `next dev` only unlocks Pro locally
// (NODE_ENV is 'production' on every deployed build). Add ?pro=0 to preview
// the locked state. Never defaults to true.

import { getCurrentSubscriber } from '@/lib/auth'
import { devPro } from '@/lib/dev-pro'

export async function resolveIsPro(proParam?: string): Promise<boolean> {
  const subscriber = await getCurrentSubscriber()
  return (subscriber?.is_pro ?? false) || devPro(proParam)
}
