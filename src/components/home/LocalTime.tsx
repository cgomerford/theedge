'use client'

import { useEffect, useState } from 'react'

// First-pitch time in the viewer's own time zone. The server renders Eastern time with "ET"; once the page is in the
// browser the text switches to local time. (suppressHydrationWarning: the two renders differ on purpose.)
export default function LocalTime({ iso }: { iso: string }) {
  const [text, setText] = useState(() => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET')
  useEffect(() => {
    setText(new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))
  }, [iso])
  return <time dateTime={iso} suppressHydrationWarning>{text}</time>
}
