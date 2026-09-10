// src/components/nfl/diagrams/NflFormationDiagram.tsx
//
// Standard 11-personnel alignment (5 OL, 1 RB, 1 TE, 3 WR) shown for
// all three formations — what changes between Shotgun/Under Center/
// Pistol is backfield depth and alignment, which is the actual
// definitional difference between these formations. OL/WR/TE
// positioning is the same real base alignment across all three since
// personnel grouping, not formation, determines receiver splits.

import { NflFieldBase, NflPlayerDot, LOS_Y } from './NflFieldBase'

export type FormationKey = 'SHOTGUN' | 'UNDER CENTER' | 'PISTOL'

const OL_Y = LOS_Y
const OL_X = { LT: 146.5, LG: 206.5, C: 266.5, RG: 326.5, RT: 386.5 }
const TE_X = 416.5
const X_WR = { x: 40, y: LOS_Y }
const SLOT_WR = { x: 100, y: LOS_Y - 5 }
const Z_WR = { x: 490, y: LOS_Y }

const BACKFIELD: Record<FormationKey, { qb: { x: number; y: number }; rb: { x: number; y: number } }> = {
  SHOTGUN: { qb: { x: 266.5, y: LOS_Y - 45 }, rb: { x: 226.5, y: LOS_Y - 45 } },
  'UNDER CENTER': { qb: { x: 266.5, y: LOS_Y - 12 }, rb: { x: 266.5, y: LOS_Y - 45 } },
  PISTOL: { qb: { x: 266.5, y: LOS_Y - 30 }, rb: { x: 266.5, y: LOS_Y - 55 } },
}

export default function NflFormationDiagram({ formation, height = 260 }: { formation: FormationKey; height?: number }) {
  const { qb, rb } = BACKFIELD[formation]

  return (
    <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.1)', padding: 12 }}>
      <NflFieldBase>
        {/* Offensive line */}
        <NflPlayerDot x={OL_X.LT} y={OL_Y} label="LT" jersey={76} side="offense" />
        <NflPlayerDot x={OL_X.LG} y={OL_Y} label="LG" jersey={66} side="offense" />
        <NflPlayerDot x={OL_X.C} y={OL_Y} label="C" jersey={62} side="offense" />
        <NflPlayerDot x={OL_X.RG} y={OL_Y} label="RG" jersey={67} side="offense" />
        <NflPlayerDot x={OL_X.RT} y={OL_Y} label="RT" jersey={77} side="offense" />

        {/* TE, WRs */}
        <NflPlayerDot x={TE_X} y={OL_Y} label="TE" jersey={87} side="offense" />
        <NflPlayerDot x={X_WR.x} y={X_WR.y} label="X" jersey={11} side="offense" />
        <NflPlayerDot x={SLOT_WR.x} y={SLOT_WR.y} label="SLOT" jersey={17} side="offense" />
        <NflPlayerDot x={Z_WR.x} y={Z_WR.y} label="Z" jersey={19} side="offense" />

        {/* Backfield */}
        <NflPlayerDot x={qb.x} y={qb.y} label="QB" jersey={9} side="offense" />
        <NflPlayerDot x={rb.x} y={rb.y} label="RB" jersey={22} side="offense" />
      </NflFieldBase>
      <div style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, color: '#78716C', marginTop: 6, letterSpacing: '0.06em' }}>
        {formation} · 11 PERSONNEL
      </div>
    </div>
  )
}
