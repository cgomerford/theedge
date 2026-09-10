// src/components/nfl/diagrams/NflCoverageDiagram.tsx
// FULL REPLACEMENT — adds Cover 0, Cover 6, Cover 9, 2-Man, Combo.
// Bumped offense silhouette opacity 0.35 -> 0.5 for better context.
//
// Honesty note on Cover 9 and Combo: unlike Cover 0-4, these aren't
// single fixed alignments -- Cover 9 is a pattern-match RULE SET
// layered on a quarters-like shell (the rules, not the pre-snap
// alignment, are what make it "9"), and Combo is inherently a mixed
// man/zone technique that varies play to play. Both are shown as
// representative alignments, not a claim that this is the only shape
// either coverage can take.

import { NflFieldBase, NflPlayerDot, LOS_Y } from './NflFieldBase'

export type CoverageKey = 'COVER 0' | 'COVER 1' | 'COVER 2' | 'COVER 3' | 'COVER 4' | 'COVER 6' | 'COVER 9' | '2-MAN' | 'COMBO'

const DL_X = [206, 246, 286, 326]
const LB_X = { will: 226, mike: 306 }

type Shell = {
  cb: { left: { x: number; y: number }; right: { x: number; y: number } }
  nickel: { x: number; y: number }
  safety: { x: number; y: number }[]
  lb: { will: number; mike: number }
}

const SHELLS: Record<CoverageKey, Shell> = {
  'COVER 0': {
    cb: { left: { x: 40, y: LOS_Y - 2 }, right: { x: 490, y: LOS_Y - 2 } },
    nickel: { x: 100, y: LOS_Y - 2 },
    safety: [{ x: 180, y: LOS_Y + 20 }, { x: 353, y: LOS_Y + 20 }], // no deep help, both play up/blitz
    lb: { will: LOS_Y + 15, mike: LOS_Y + 15 }, // blitzing depth
  },
  'COVER 1': {
    cb: { left: { x: 40, y: LOS_Y - 2 }, right: { x: 490, y: LOS_Y - 2 } },
    nickel: { x: 100, y: LOS_Y - 6 },
    safety: [{ x: 266.5, y: LOS_Y + 90 }],
    lb: { will: LOS_Y + 25, mike: LOS_Y + 25 },
  },
  'COVER 2': {
    cb: { left: { x: 40, y: LOS_Y + 8 }, right: { x: 490, y: LOS_Y + 8 } },
    nickel: { x: 100, y: LOS_Y + 20 },
    safety: [{ x: 180, y: LOS_Y + 80 }, { x: 353, y: LOS_Y + 80 }],
    lb: { will: LOS_Y + 30, mike: LOS_Y + 30 },
  },
  'COVER 3': {
    cb: { left: { x: 40, y: LOS_Y + 70 }, right: { x: 490, y: LOS_Y + 70 } },
    nickel: { x: 100, y: LOS_Y + 25 },
    safety: [{ x: 266.5, y: LOS_Y + 80 }],
    lb: { will: LOS_Y + 25, mike: LOS_Y + 25 },
  },
  'COVER 4': {
    cb: { left: { x: 40, y: LOS_Y + 60 }, right: { x: 490, y: LOS_Y + 60 } },
    nickel: { x: 100, y: LOS_Y + 25 },
    safety: [{ x: 180, y: LOS_Y + 65 }, { x: 353, y: LOS_Y + 65 }],
    lb: { will: LOS_Y + 25, mike: LOS_Y + 25 },
  },
  'COVER 6': {
    // split field: left = Cover 2 (flat corner, deep-half safety),
    // right = Cover 4 (deep-quarter corner + safety)
    cb: { left: { x: 40, y: LOS_Y + 8 }, right: { x: 490, y: LOS_Y + 60 } },
    nickel: { x: 100, y: LOS_Y + 20 },
    safety: [{ x: 180, y: LOS_Y + 80 }, { x: 353, y: LOS_Y + 65 }],
    lb: { will: LOS_Y + 28, mike: LOS_Y + 25 },
  },
  'COVER 9': {
    // pattern-match quarters -- same representative shell as Cover 4,
    // see honesty note above
    cb: { left: { x: 40, y: LOS_Y + 60 }, right: { x: 490, y: LOS_Y + 60 } },
    nickel: { x: 100, y: LOS_Y + 25 },
    safety: [{ x: 180, y: LOS_Y + 65 }, { x: 353, y: LOS_Y + 65 }],
    lb: { will: LOS_Y + 25, mike: LOS_Y + 25 },
  },
  '2-MAN': {
    cb: { left: { x: 40, y: LOS_Y - 2 }, right: { x: 490, y: LOS_Y - 2 } }, // press man, unlike Cover 2's flat technique
    nickel: { x: 100, y: LOS_Y - 4 },
    safety: [{ x: 180, y: LOS_Y + 80 }, { x: 353, y: LOS_Y + 80 }], // two deep, same depth as Cover 2
    lb: { will: LOS_Y + 20, mike: LOS_Y + 20 }, // tighter, in man on RB/TE
  },
  COMBO: {
    // mixed technique: left side press-man, right side off-zone --
    // representative of the "combo" concept, not a fixed rule
    cb: { left: { x: 40, y: LOS_Y - 2 }, right: { x: 490, y: LOS_Y + 40 } },
    nickel: { x: 100, y: LOS_Y + 15 },
    safety: [{ x: 266.5, y: LOS_Y + 85 }],
    lb: { will: LOS_Y + 22, mike: LOS_Y + 28 },
  },
}

export default function NflCoverageDiagram({ coverage, height = 260 }: { coverage: CoverageKey; height?: number }) {
  const shell = SHELLS[coverage]

  return (
    <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.1)', padding: 12 }}>
      <NflFieldBase>
        <g opacity={0.5}>
          <NflPlayerDot x={146.5} y={LOS_Y} label="" side="offense" />
          <NflPlayerDot x={206.5} y={LOS_Y} label="" side="offense" />
          <NflPlayerDot x={266.5} y={LOS_Y} label="" side="offense" />
          <NflPlayerDot x={326.5} y={LOS_Y} label="" side="offense" />
          <NflPlayerDot x={386.5} y={LOS_Y} label="" side="offense" />
          <NflPlayerDot x={416.5} y={LOS_Y} label="" side="offense" />
          <NflPlayerDot x={40} y={LOS_Y} label="" side="offense" />
          <NflPlayerDot x={100} y={LOS_Y - 5} label="" side="offense" />
          <NflPlayerDot x={490} y={LOS_Y} label="" side="offense" />
          <NflPlayerDot x={266.5} y={LOS_Y - 45} label="" side="offense" />
        </g>

        {DL_X.map((x, i) => <NflPlayerDot key={i} x={x} y={LOS_Y} label="DL" jersey={90 + i} side="defense" />)}

        <NflPlayerDot x={LB_X.will} y={shell.lb.will} label="LB" jersey={54} side="defense" />
        <NflPlayerDot x={LB_X.mike} y={shell.lb.mike} label="LB" jersey={51} side="defense" />

        <NflPlayerDot x={shell.cb.left.x} y={shell.cb.left.y} label="CB" jersey={24} side="defense" />
        <NflPlayerDot x={shell.cb.right.x} y={shell.cb.right.y} label="CB" jersey={21} side="defense" />
        <NflPlayerDot x={shell.nickel.x} y={shell.nickel.y} label="NB" jersey={29} side="defense" />

        {shell.safety.map((s, i) => <NflPlayerDot key={i} x={s.x} y={s.y} label="S" jersey={i === 0 ? 27 : 33} side="defense" />)}
      </NflFieldBase>
      <div style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, color: '#78716C', marginTop: 6, letterSpacing: '0.06em' }}>
        {coverage} · NICKEL PERSONNEL
      </div>
    </div>
  )
}