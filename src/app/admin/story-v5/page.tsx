// src/app/admin/story-v5/page.tsx
//
// Admin: x9Lab animated game preview (Remotion). Guarded by src/proxy.ts (/admin basic auth).

import DataCheck from '@/components/admin/story-v5/DataCheck'

export const dynamic = 'force-dynamic'

export default function Page() {
  return <DataCheck defaultPk={849802} />
}
