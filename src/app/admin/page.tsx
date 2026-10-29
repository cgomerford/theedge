// src/app/admin/page.tsx
//
// Admin home: one page that links to every admin tool. Auth: src/proxy.ts already guards every /admin path.
// To add a tool, add one entry to SECTIONS below. Dynamic routes (e.g. /admin/scout-video/[slug]) need a
// slug, so they are opened from the page that links to them rather than listed here.

import XMark from '@/components/XMark'
import Link from 'next/link'
import { css } from '@/app/admin/admin-css'

export const metadata = { title: 'Admin - x9Lab', robots: { index: false, follow: false } }

type Tool = { href: string; title: string; blurb: string; tag?: string }

const SECTIONS: { title: string; note: string; tools: Tool[] }[] = [
  {
    title: 'Publish',
    note: 'Daily output for X and the site',
    tools: [
      { href: '/admin/dashboard', title: 'Dashboard', tag: 'Daily', blurb: 'Game preview teaser video, pitcher, batter and post-game reels, player stat line graphic, scout report graphic, bracket and in-game X cards.' },
      { href: '/admin/graphics', title: 'Graphic Blocks', tag: 'New', blurb: 'Six graphic templates with logos and headshots. Auto-fill from a game or type the numbers, then download a PNG at 1200x675 or 1080x1350.' },
      { href: '/admin/story-v5', title: 'Story v5', tag: 'Video', blurb: 'Animated game preview video: choose a game, select and reorder the slides, edit the text, then render a 1080x1350 MP4 and contact sheet.' },
      { href: '/admin/articles', title: 'Articles', blurb: 'Article drafts and published pieces. Drafts are created first and published as a separate step.' },
      { href: '/admin/articles/new', title: 'New article', blurb: 'Open the article editor with a blank draft.' },
    ],
  },
  {
    title: 'Daily data',
    note: 'What happened and what is on today',
    tools: [
      { href: '/admin/archive', title: 'Archive', blurb: 'Yesterday’s performance, today’s reads, top performers, rising players and reel, scout stories, post-game and in-game X cards, data room, player stat cards.' },
      { href: '/admin/yesterday-stats', title: 'Yesterday’s stats', blurb: 'Every final game from yesterday across MLB, Triple-A and Double-A, run through the same top three and nugget pipeline.' },
      { href: '/admin/live-tracker', title: 'Live tracker', blurb: 'Polling board for games in progress, with browser notifications.' },
      { href: '/admin/predictions', title: 'Predictions explorer', blurb: 'Browse stored model output by game. Needs a signed-in admin account on the site, as well as the admin password.' },
    ],
  },
  {
    title: 'Workshop',
    note: 'Ideas on trial and approved mockups',
    tools: [
      { href: '/admin/lab', title: 'The Lab', blurb: 'Private space to trial product ideas on real data before they earn a public page.' },
      { href: '/admin/lab/team-makeup', title: 'Team make-up: pitching', tag: 'Lab', blurb: 'Starters vs bullpen: pitch mix, velocity variation, movement and arm-angle variation by club.' },
      { href: '/admin/lab/chart-builder', title: 'Dashboard builder', tag: 'Lab', blurb: 'Canvas of KPI cards, scatters, bars and tables with league and starters-vs-bullpen filters.' },
      { href: '/admin/mockups', title: 'Mockups', blurb: 'Index of the static HTML mockups. Get one approved here before building the React version.' },
    ],
  },
]

export default function AdminHome() {
  return (
    <main className="admin">
      <style>{css}</style>
      <style>{`
        .admin .ah-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
        .admin .ah-tool{display:flex;flex-direction:column;gap:6px;min-height:104px;padding:14px 16px;border:1px solid #1A1A1A14;border-radius:10px;background:#FAF8F3;color:inherit;text-decoration:none;transition:border-color .12s,background .12s}
        .admin .ah-tool:hover,.admin .ah-tool:focus-visible{border-color:#FF5722;background:#fff;outline:none}
        .admin .ah-top{display:flex;align-items:center;justify-content:space-between;gap:8px}
        .admin .ah-name{font-weight:800;font-size:17px;letter-spacing:-.01em}
        .admin .ah-tag{font-size:10px;text-transform:uppercase;letter-spacing:1.4px;color:#FF5722;font-weight:700;white-space:nowrap}
        .admin .ah-blurb{font-size:12.5px;line-height:1.5;color:#5b5347}
        .admin .ah-path{margin-top:auto;font-size:11px;color:#8a8275}
        .admin .ah-stack{display:flex;flex-direction:column;gap:24px}
      `}</style>
      <div className="wrap">
        <div className="topbar">
          <div className="brand"><span className="mark">⊕</span> X9LAB <span className="sub">/ admin</span></div>
          <div className="topmeta">{SECTIONS.reduce((n, s) => n + s.tools.length, 0)} tools</div>
        </div>
        <div className="ah-stack">
          {SECTIONS.map((s, i) => (
            <section key={s.title} className="sec card">
              <div className="sechead">
                <span className="glyph"><XMark /></span>
                <h2>{s.title}</h2>
                <span className="tag">{`0${i + 1}`} · {s.note}</span>
              </div>
              <div className="ah-grid">
                {s.tools.map(t => (
                  <Link key={t.href} href={t.href} className="ah-tool">
                    <span className="ah-top"><span className="ah-name">{t.title}</span>{t.tag && <span className="ah-tag">{t.tag}</span>}</span>
                    <span className="ah-blurb">{t.blurb}</span>
                    <span className="ah-path">{t.href}</span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
        <div className="footnote">
          ⊕ Internal tools, guarded and not indexed. Scout report video exports open from each game&rsquo;s scout page, not from here.
        </div>
      </div>
    </main>
  )
}
