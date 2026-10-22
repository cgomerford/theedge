'use client'

// src/components/contact-lab/ContactLab.tsx
//
// The Contact Lab (mockup: x9Lab Batting Lab_ Nerve Centre mockup.html). One page that follows a hitter from how he stands to what the ball
// did: § 01 Contact Engine (league scatter, quality of contact, spray by type, Pull AIR% by season) · § 02 Swing Changes (by month: stance,
// bat speed, attack angle against Pull AIR%, barrel rate, squared-up rate) · § 03 Three True Outcomes (K / BB / HR mix, rolling lines, leaderboard).
// A sticky picker chooses the hitter; every section is read for him on the server. Sign-up gate only (the page checks it), no Pro data.
// Descriptions of what happened, with the sample behind each number. Props are plain data.

import Link from 'next/link'
import { C, Card, Empty, Foot, Section } from '@/components/team/ui'
import type { ContactLeaders, ContactProfile } from '@/lib/contact-profile/model'
import { rate } from '@/lib/contact-profile/model'
import type { SwingMonthRow, TtoRow } from '@/lib/nerve-centre/model'
import ContactScatter from './ContactScatter'
import HitterPicker from './HitterPicker'
import { Badge, CONTACT_CSS, QualityBars, SeasonBars, SprayGrid, type Pt } from './ContactTab'
import SwingChanges from './SwingChanges'
import TtoSection from './TtoSection'

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`

export default function ContactLab({ leaders, selectedId, contact, swing, ttoProfile, ttoLeaders, ttoSeason }: {
  leaders: ContactLeaders; selectedId: number; contact: ContactProfile | null; swing: SwingMonthRow[] | null
  ttoProfile: TtoRow | null; ttoLeaders: { rows: TtoRow[]; league: TtoRow | null } | null; ttoSeason: number
}) {
  const cur = contact ? contact.seasons[contact.seasons.length - 1] : null
  const lge = contact && cur ? contact.league.seasons.find(r => r.season === cur.season) ?? null : null
  const name = contact?.name ?? ttoProfile?.name ?? null
  const solid = cur ? cur.solid + cur.barrel : 0
  const dSolid = cur && lge ? (solid / cur.n_bbe - (lge.solid + lge.barrel) / lge.n_bbe) * 100 : null
  const pts: Pt[] = contact
    ? contact.seasons.map(r => ({ x: String(r.season), n: r.n_bbe, v: rate(r, 'pullAir'), lge: rate(contact.league.seasons.find(l => l.season === r.season), 'pullAir'), solid: r.n_bbe >= 150 }))
    : []
  const outcomes = contact ? contact.months.map(m => ({ month: m.month, n_bbe: m.n_bbe, pull_air: m.pull_air, barrel: m.barrel })) : []

  return (
    <div>
      <style>{CONTACT_CSS}</style>
      <style>{CSS}</style>
      <header style={{ paddingTop: 6 }}>
        <div className="cl-eyebrow">⊕ Contact Lab · Batting</div>
        <h1 style={{ margin: '4px 0 10px', fontWeight: 800, fontSize: 'clamp(32px,5.4vw,54px)', letterSpacing: '-.03em', lineHeight: 1.02, maxWidth: '20ch' }}>Setup, swing, contact, outcome. All in one place.</h1>
        <p style={{ margin: 0, maxWidth: '64ch', color: '#5b5347', fontSize: 16 }}>Three views that follow a hitter from how he stands to what the ball did. Choose a hitter and every section updates. <b>A description of what happened, not a forecast.</b></p>
      </header>
      <nav className="cl-chain" aria-label="The hitting chain">
        <a href="#changes"><b>1 · Setup</b><span>Stance angle, width</span></a>
        <a href="#changes"><b>2 · Swing</b><span>Bat speed, attack angle</span></a>
        <a href="#contact"><b>3 · Contact</b><span>Quality, spray, Pull AIR</span></a>
        <a href="#tto"><b>4 · Outcome</b><span>K, BB, HR</span></a>
      </nav>

      <div className="cl-picker">
        <HitterPicker rows={leaders.rows.map(r => ({ id: r.id, name: r.name, team: r.team, n: r.n }))} selectedId={selectedId} selectedName={name} />
        <nav className="cl-jump" aria-label="Sections"><a href="#contact">Contact Engine</a><a href="#changes">Swing Changes</a><a href="#tto">Three True Outcomes</a></nav>
      </div>

      <Section id="contact" num="01" title="Contact Engine" sub="Who gets the most out of contact? Pulled fly balls and line drives are where most of the extra-base damage lives, so each hitter is plotted by how often he pulls the ball in the air against how often he barrels it.">
        <div className="cl-g2">
          <Card title="League map">
            <p className="cl-cap">Pull AIR% against barrel rate. Every hitter with {100}+ batted balls in {leaders.season}; the selected hitter is yellow. Dashed lines are medians.</p>
            <ContactScatter rows={leaders.rows} season={leaders.season} selectedId={selectedId} />
          </Card>
          <div className="cl-stack">
            <Card title="Quality of contact">
              {cur ? (
                <>
                  <div className="cl-row"><b style={{ fontSize: 18 }}>{name} vs MLB</b><Badge n={cur.n_bbe} /></div>
                  <QualityBars cur={cur} lge={lge} />
                  {dSolid != null && <p style={{ margin: '10px 0 0', fontSize: 14 }}><b>{pct(solid / cur.n_bbe)}</b> of his batted balls were solid or barrelled, {dSolid >= 0 ? '+' : '−'}{Math.abs(dSolid).toFixed(1)} points against MLB (n = {cur.n_bbe}).</p>}
                  <Foot>Source: Baseball Savant via pybaseball (launch_speed_angle): the six buckets Statcast assigns from exit velocity and launch angle. Share of his batted balls, n shown.</Foot>
                </>
              ) : <Empty>No contact data for this hitter yet.</Empty>}
            </Card>
            <Card title="Spray by type">
              {cur ? (
                <>
                  <p className="cl-cap">Where it goes, on the ground and in the air: share of all his batted balls in each spot, with the gap to MLB. Orange tint = above MLB. Pull is always his pull side.</p>
                  <SprayGrid cur={cur} lge={lge} />
                  <Foot>Source: Baseball Savant via pybaseball (hc_x, hc_y, bb_type). Share of all {cur.n_bbe} batted balls; spray direction mirrored for left-handed hitters; air = fly balls, line drives and popups.</Foot>
                </>
              ) : <Empty>No spray data for this hitter yet.</Empty>}
            </Card>
          </div>
        </div>
        <Card title="What changed" style={{ marginTop: 16 }}>
          <p className="cl-cap" style={{ marginBottom: 4 }}><b style={{ color: C.ink, fontSize: 18 }}>Pull AIR%, season by season</b></p>
          {pts.length ? <SeasonBars pts={pts} label="Pull AIR%" define="pulled fly balls, line drives and popups ÷ all batted balls" /> : <Empty>No season rows for this hitter yet.</Empty>}
        </Card>
      </Section>

      <Section id="changes" num="02" title="Swing Changes" sub="Did his setup or swing change, and did the results move over the same months? The top row is his inputs; the bottom row is what happened. The line underneath describes both, without claiming one caused the other.">
        {swing ? <SwingChanges swing={swing} contact={outcomes} season={ttoSeason} name={name} /> : <Empty>Monthly swing data isn’t built yet. It refreshes weekly from Baseball Savant.</Empty>}
      </Section>

      <Section id="tto" num="03" title="Three True Outcomes" sub="How much of his game ends without the defence touching it, and in what mix: strikeouts, walks and home runs, how steady they are, and where the rest of his plate appearances go.">
        <TtoSection profile={ttoProfile} leaders={ttoLeaders} season={ttoSeason} />
      </Section>

      <p style={{ margin: '34px 0 0', fontSize: 12, color: C.mute }}>Looking for one hitter’s full pages? <Link href={`/mlb/lab/batting-lab/${selectedId}/contact`} style={{ color: C.orange, fontWeight: 700 }}>Open his Batting Lab</Link>.</p>
    </div>
  )
}

const CSS = `
.cl-eyebrow{font-size:11px;letter-spacing:.14em;font-weight:700;color:${C.orange};text-transform:uppercase}
.cl-chain{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:22px 0 0}
.cl-chain a{background:#fff;border:1px solid ${C.line};border-radius:14px;padding:12px 14px;font-size:14px;color:${C.ink};text-decoration:none;display:flex;flex-direction:column}
.cl-chain a b{font-size:15px}.cl-chain a span{color:${C.mute};font-size:13px}
.cl-picker{position:sticky;top:0;z-index:20;background:${C.cream};border-bottom:1px solid ${C.line};margin:18px -24px 0;padding:10px 24px;display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.cl-jump{display:flex;gap:6px;margin-left:auto;flex-wrap:wrap}
.cl-jump a{font-size:13px;font-weight:600;text-decoration:none;color:${C.ink};border:1px solid ${C.line};background:#fff;padding:5px 11px;border-radius:999px}
.cl-g2{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:16px;align-items:start}
.cl-stack{display:flex;flex-direction:column;gap:16px;min-width:0}
.cl-cap{color:#5b5347;font-size:13px;margin:0 0 12px}
.cl-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:0 0 12px}
@media(max-width:900px){.cl-chain{grid-template-columns:repeat(2,1fr)}.cl-g2{grid-template-columns:minmax(0,1fr)}.cl-picker{margin:18px -16px 0;padding:10px 16px}.cl-jump{margin-left:0}}
`
