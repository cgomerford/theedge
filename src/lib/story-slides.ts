// Generic story-slide shape shared by every slide type — lead, bullpen,
// and later arsenal/park/trending. StoryOverlay renders this one shape
// for everything, so a new slide type is a new object built here, not a
// new component. Slides with real data go in the returned array; features
// without wired data go in LOCKED_SLIDES (dimmed circle, not tappable).

export type StorySlideChip = { label: string; value: string; emphasis?: boolean }
import type { StoryIconKey } from '@/components/StoryIcons'

export type StorySlide = {
  key: string
  circleLabel: string
  iconKey: StoryIconKey // was circleIcon (emoji string) — see StoryIcons.tsx (2026-07-13)
  sectionLabel: string
  heading: string
  chips?: StorySlideChip[]
}

export type LockedSlide = {
  key: string
  circleLabel: string
  iconKey: StoryIconKey
}

export function buildStoryLeadSlide(storyLead: string | null | undefined): StorySlide | null {
  if (!storyLead) return null
  return {
    key: 'lead',
    circleLabel: 'The story',
    iconKey: 'story',
    sectionLabel: 'Tonight',
    heading: storyLead,
  }
}

// Bullpen deliberately NOT built yet — BullpenData's real fields (fatigue,
// days-running, availability) aren't confirmed. Wire buildBullpenSlide()
// here once BullpenPanel.tsx is reviewed; move 'bullpen' out of
// LOCKED_SLIDES at the same time.
export const LOCKED_SLIDES: LockedSlide[] = [
  { key: 'bullpen', circleLabel: 'Bullpen', iconKey: 'bullpen' },
  { key: 'arsenal', circleLabel: 'Arsenal', iconKey: 'arsenal' },
  { key: 'park', circleLabel: 'Park', iconKey: 'park' },
  { key: 'trending', circleLabel: 'Trending', iconKey: 'trending' },
]