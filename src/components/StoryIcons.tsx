// Line-stroke icon set for story circles — replaces the emoji placeholders.
// Matches the padlock-icon convention already used in LineupCard.tsx
// (currentColor stroke, small viewBox) rather than introducing emoji or a
// new icon library dependency.

export type StoryIconKey = 'story' | 'bullpen' | 'arsenal' | 'park' | 'trending'

const STROKE = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.4 } as const

export const STORY_ICONS: Record<StoryIconKey, JSX.Element> = {
  story: (
    <svg width="18" height="18" viewBox="0 0 20 20" {...STROKE}>
      <path d="M4 15c0-2.5 1.8-4 4-4h4c2.2 0 4 1.5 4 4" strokeLinecap="round" />
      <circle cx="10" cy="7" r="3" />
    </svg>
  ),
  bullpen: (
    <svg width="18" height="18" viewBox="0 0 20 20" {...STROKE}>
      <circle cx="6.5" cy="7" r="2.3" />
      <circle cx="13.5" cy="7" r="2.3" />
      <path d="M2 16c0-2.2 1.8-3.6 4.5-3.6S11 13.8 11 16" strokeLinecap="round" />
      <path d="M9 16c0-2.2 1.8-3.6 4.5-3.6S18 13.8 18 16" strokeLinecap="round" />
    </svg>
  ),
  arsenal: (
    <svg width="18" height="18" viewBox="0 0 20 20" {...STROKE}>
      <circle cx="10" cy="10" r="7.5" />
      <circle cx="10" cy="10" r="4" />
      <circle cx="10" cy="10" r="0.9" fill="currentColor" />
    </svg>
  ),
  park: (
    <svg width="18" height="18" viewBox="0 0 20 20" {...STROKE}>
      <path d="M3 17V9l7-5 7 5v8" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M8 17v-5h4v5" strokeLinejoin="round" />
    </svg>
  ),
  trending: (
    <svg width="18" height="18" viewBox="0 0 20 20" {...STROKE}>
      <path d="M3 14l5-5 3 3 6-6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 6h4v4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
}