// src/components/admin/story-v5/remotion/time.ts
//
// First pitch time, always in Eastern and Pacific. Computed from the game's UTC start time (so saved data from before PT existed still works).
// "8PM ET · 5PM PT". Minutes show only when not :00 ("7:07PM ET").

export type FirstPitchTimes = { et: string; pt: string; line: string }

function clock(d: Date, timeZone: string): string {
  const t = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true }).format(d).replace(/\s/g, '')
  return t.replace(':00', '')
}

export function firstPitchTimes(iso: string): FirstPitchTimes | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const et = clock(d, 'America/New_York'), pt = clock(d, 'America/Los_Angeles')
  return { et, pt, line: `${et} ET · ${pt} PT` }
}
