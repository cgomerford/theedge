'use client'

// src/components/pitch-shape/RunsSavedExplainer.tsx
//
// "What is runs saved?" in plain language, as a small disclosure that sits next to wherever the Pitch Shape Lab shows the number. One definition, one worked example and the reading rules,
// so every place says the same thing. It describes what the number measures and where it can mislead; it makes no claim about what a pitcher will do.

import { C } from '@/components/team/ui'
import { LEVEL_LABEL, isMilb, type Level } from '@/lib/milb-shape/levels'

const ORANGE_TEXT = '#B83A0E'

/** `compact` is a one-line toggle for a tight spot; the default is a block with a border. `example` is an optional real figure from the page, used in the worked line. */
export default function RunsSavedExplainer({ level = 'mlb', compact = false, example }: { level?: Level; compact?: boolean; example?: number | null }) {
  const lab = isMilb(level) ? LEVEL_LABEL[level] : 'MLB'
  const ex = example != null && Math.abs(example) >= 0.05 ? example : null
  return (
    <details style={{ background: compact ? 'transparent' : '#fff', border: compact ? 'none' : `1px solid ${C.line}`, borderRadius: 6, padding: compact ? 0 : '2px 14px', margin: compact ? '6px 0 0' : '10px 0 0' }}>
      <summary className="pv-k" style={{ cursor: 'pointer', minHeight: compact ? 28 : 40, display: 'flex', alignItems: 'center', color: ORANGE_TEXT }}>What is “runs saved”?</summary>
      <div style={{ fontSize: 13.5, lineHeight: 1.6, color: '#3a352c', padding: '2px 0 12px', maxWidth: 760 }}>
        <p style={{ margin: '0 0 8px' }}><b>Runs saved per 100 pitches</b> is how many runs a group of pitches has kept off the board, per 100 of them, compared with the average pitch of that type at {lab}. Higher is better for the pitcher, zero is average.</p>
        <ol style={{ margin: '0 0 8px 18px', padding: 0 }}>
          <li><b>Every pitch changes the expected runs.</b> Statcast records, for each pitch, the change in the runs a team is expected to score from that point of the inning (delta run expectancy): a ball raises it, a strike or a strikeout lowers it, a double raises it a lot.</li>
          <li><b>Sum them and divide.</b> The changes for the group’s pitches, summed, divided by the pitches and multiplied by 100, give the runs allowed per 100 pitches.</li>
          <li><b>Set it against the average.</b> Runs saved is the {lab} average for that pitch type minus the group’s, so a group that allowed fewer runs than average scores above zero.</li>
        </ol>
        <p style={{ margin: '0 0 8px' }}><b>Reading it.</b> +1.00 means one run fewer than average for every 100 pitches; −1.00 means one run more. Over a 3,000-pitch season that is about 30 runs, around three wins: simple arithmetic to show the scale, not a forecast. {ex != null && <>On this page the figure is <b>{ex >= 0 ? '+' : '−'}{Math.abs(ex).toFixed(2)}</b>, so the group has {ex >= 0 ? 'kept' : 'let in'} about {Math.abs(ex).toFixed(2)} {ex >= 0 ? 'more runs off' : 'more runs onto'} the board per 100 pitches than the average {lab} pitch of that type.</>}</p>
        <p style={{ margin: '0 0 8px' }}><b>Who it is for.</b> For a shape, it is every pitch of the type that moves like it (within 1 in of ride and run, any speed). For a pitcher, it is his own pitches of that type. A pitcher’s own number is set against his shape’s to say whether his results are ahead of, behind or in line with what the shape has produced.</p>
        <p style={{ margin: 0 }}><b>What it cannot tell you.</b> It folds in everything that happened on those pitches: location, sequencing, the hitters faced, defense and luck, not only movement. It needs 300 pitches before it is shown, and a small sample can swing a lot. {isMilb(level) ? `At ${lab} it is measured against ${lab} hitters, parks and strike zones, so it is not on the same scale as MLB’s: compare a ${lab} figure with the ${lab} average, not with an MLB figure.` : 'It describes what already happened.'}</p>
      </div>
    </details>
  )
}
