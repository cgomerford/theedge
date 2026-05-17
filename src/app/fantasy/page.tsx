import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import { getFantasyPicks, type FantasyPick } from '@/lib/fantasy'
import { getCurrentSubscriber } from '@/lib/auth'

export const revalidate = 1800
export const metadata = {
  title: 'The Fantasy Desk · The Edge',
  description: 'Tonight\'s streamers, movers, fallers, and sleepers — what to do with your fantasy roster, with plain-English explanations of every stat.',
}

export default async function FantasyPage() {
  const { picks, forDate, isStale } = await getFantasyPicks()

  const displayDate = new Date(forDate + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

const subscriber = await getCurrentSubscriber()
  const isPro = subscriber?.is_pro ?? false

  return (
    <main className="min-h-screen bg-[#FAF8F3] text-stone-900 overflow-x-hidden">
      <SiteHeader variant="page" />

      {/* ════ MASTHEAD ════════════════════════════════════════════════════ */}
      <div className="border-b border-stone-200 bg-stone-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-stone-400">
          <span>{displayDate}</span>
          <span className="text-stone-300">Fantasy Edition</span>
        </div>
      </div>

      {/* ════ TITLE BLOCK ════════════════════════════════════════════════ */}
      <div className="border-b-2 border-stone-900 bg-stone-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 pb-6">
          <div className="text-[10px] font-mono uppercase tracking-widest text-orange-600 mb-2">
            ⊕ The Fantasy Desk
          </div>
          <h1 className="font-serif font-light text-5xl sm:text-7xl tracking-tight leading-none">
            Tonight&apos;s plays<span className="text-orange-600">.</span>
          </h1>
          <p className="text-stone-500 font-serif italic mt-3 text-base sm:text-lg max-w-2xl">
            What to start, what to bench, who to add. With the math behind every call.
          </p>
        </div>
      </div>

      {/* Stale data warning */}
      {isStale && (
        <div className="bg-yellow-50 border-b border-yellow-200">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-2 text-[11px] font-mono text-yellow-800">
            ⚠ Showing yesterday&apos;s picks — tonight&apos;s computed at 11:30 PM UK. Check back later.
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-14">

        {/* ════ STREAMERS ═══════════════════════════════════════════════ */}
        <PickSection
          label="Streamers"
          sublabel="The best free-agent pitchers to stream tonight"
          colorKey="emerald"
          picks={picks.streamer}
          renderPick={(p) => <StreamerCard pick={p} isPro={isPro} />}
         emptyMessage="Lineups still pending tonight. Streamers populate when probable pitchers confirm — usually 3-4 hours pre-first-pitch."
        />

        {/* ════ MOVERS ══════════════════════════════════════════════════ */}
        <PickSection
          label="Movers"
          sublabel="Edge scores that swung since this morning"
          colorKey="orange"
          picks={picks.mover}
          renderPick={(p) => <MoverCard pick={p} isPro={isPro} />}
          emptyMessage="No 8+ point edge swings yet. We snapshot predictions every few hours — check back after lineup news drops."
        />

        {/* ════ FALLERS ═════════════════════════════════════════════════ */}
        <PickSection
          label="Fallers"
          sublabel="Fantasy stars in tough spots tonight"
          colorKey="red"
          picks={picks.faller}
          renderPick={(p) => <FallerCard pick={p} isPro={isPro} />}
          emptyMessage="Most matchups look favourable for the bats tonight. Fallers surface when an elite arm draws a strong-offence club."
        />

        {/* ════ SLEEPERS ════════════════════════════════════════════════ */}
        <PickSection
          label="Sleepers"
          sublabel="Hidden value the surface stats miss"
          colorKey="blue"
          picks={picks.sleeper}
          renderPick={(p) => <SleeperCard pick={p} isPro={isPro} />}
          emptyMessage="Tonight's slate is clean — no significant ERA/FIP gaps or vulnerable bottom-tier lineups. We surface these when the math justifies it, not just to fill space."
        />

        {/* ════ DECODING THE STATS ═════════════════════════════════════ */}
        <section>
          <SectionHeader
            label="Decoding the stats"
            sublabel="Plain English for every metric we use"
            colorKey="stone"
          />
          <div className="grid sm:grid-cols-2 gap-4 mt-6">
            {STAT_GUIDES.map((s) => (
              <StatGuideCard key={s.stat} guide={s} />
            ))}
          </div>
        </section>

        {/* ════ THE MATH ═══════════════════════════════════════════════ */}
        <section className="bg-stone-900 text-stone-100 p-6 sm:p-8">
          <div className="text-[10px] font-mono uppercase tracking-widest text-yellow-300 font-bold mb-3">
            § How we pick
          </div>
          <h2 className="font-serif font-light text-2xl sm:text-3xl tracking-tight mb-4">
            No black boxes. Just weighted math.
          </h2>
          <div className="space-y-4 text-sm text-stone-300 leading-relaxed font-serif">
            <p>
              Every pick on this page comes from a transparent formula. <strong className="text-stone-100">Streamers</strong> blend
              pitcher quality (40%), opponent offence (30%), stuff/whiff% (15%), and park (15%) into a single 0–100 score.
              <strong className="text-stone-100"> Movers</strong> are games where the edge swung 8+ points since our morning prediction.
              <strong className="text-stone-100"> Fallers</strong> are high-OPS offences facing pitchers in the top quintile
              by FIP and whiff%.
              <strong className="text-stone-100"> Sleepers</strong> are pitchers with an ugly ERA but a much better FIP — the
              regression-incoming candidates — or anyone facing a bottom-5 offence.
            </p>
            <p>
              Sample sizes matter. We only count splits with enough data to be meaningful.
              If you ever want to see the raw numbers behind a pick,{' '}
              <Link href="/track-record" className="text-yellow-300 hover:underline">our public track record</Link>{' '}
              shows the whole grading log.
            </p>
          </div>
        </section>

        {/* ════ PRO UPSELL ═════════════════════════════════════════════ */}
        {!isPro && (
          <section className="border border-stone-200 bg-white p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-2">
                  ⊕ Pro Tier · Launch June 1
                </div>
                <h3 className="font-serif font-semibold text-2xl text-stone-900 leading-tight mb-2">
                  Get the picks in your inbox every morning.
                </h3>
                <p className="text-sm text-stone-500 font-serif">
                  Pro adds Hot Zones, Umpire Effect, Bullpen Fatigue Tracker, full splits — and emails the Fantasy Desk to you at 7am.
                </p>
              </div>
              <Link
                href="/#signup"
                className="shrink-0 text-xs font-mono uppercase tracking-widest bg-stone-900 text-yellow-300 px-6 py-3 hover:bg-stone-700 transition whitespace-nowrap"
              >
                Get on the list →
              </Link>
            </div>
          </section>
        )}

      </div>

      {/* ════ FOOTER ════════════════════════════════════════════════════ */}
      <footer className="border-t border-stone-200 mt-8 px-4 sm:px-6 py-8 text-[11px] font-mono text-stone-400 bg-stone-50">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/tonight"      className="hover:text-stone-600 transition">Tonight</Link>
            <Link href="/track-record" className="hover:text-stone-600 transition">Track Record</Link>
            <Link href="/about"        className="hover:text-stone-600 transition">About</Link>
            <Link href="/faq"          className="hover:text-stone-600 transition">FAQ</Link>
            <Link href="/privacy"      className="hover:text-stone-600 transition">Privacy</Link>
            <Link href="/terms"        className="hover:text-stone-600 transition">Terms</Link>
          </div>
          <div className="text-stone-300 uppercase tracking-wider">
            Information only · Not gambling advice
          </div>
        </div>
      </footer>
    </main>
  )
}


/* ════════════════════════════════════════════════════════════════════════
 *  SUB-COMPONENTS (kept in same file for self-containment)
 * ════════════════════════════════════════════════════════════════════════ */

type ColorKey = 'emerald' | 'orange' | 'red' | 'blue' | 'stone'

const COLOR_STYLES: Record<ColorKey, { accent: string; dot: string; text: string; bg: string }> = {
  emerald: { accent: 'border-emerald-600', dot: 'bg-emerald-600', text: 'text-emerald-700', bg: 'bg-emerald-50' },
  orange:  { accent: 'border-orange-600',  dot: 'bg-orange-600',  text: 'text-orange-700',  bg: 'bg-orange-50' },
  red:     { accent: 'border-red-600',     dot: 'bg-red-600',     text: 'text-red-700',     bg: 'bg-red-50' },
  blue:    { accent: 'border-blue-600',    dot: 'bg-blue-600',    text: 'text-blue-700',    bg: 'bg-blue-50' },
  stone:   { accent: 'border-stone-400',   dot: 'bg-stone-400',   text: 'text-stone-700',   bg: 'bg-stone-50' },
}

function SectionHeader({ label, sublabel, colorKey }: { label: string; sublabel: string; colorKey: ColorKey }) {
  const c = COLOR_STYLES[colorKey]
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-stone-200 pb-3">
      <div className="flex items-baseline gap-3 min-w-0">
        <div className={`w-1.5 h-1.5 rounded-full ${c.dot} shrink-0`} />
        <div className="min-w-0">
          <div className={`text-[10px] font-mono uppercase tracking-widest font-bold ${c.text}`}>
            § {label}
          </div>
          <h2 className="text-2xl sm:text-3xl font-serif font-light text-stone-900 leading-tight mt-1">
            {sublabel}
          </h2>
        </div>
      </div>
    </div>
  )
}

function PickSection({
  label,
  sublabel,
  colorKey,
  picks,
  renderPick,
  emptyMessage,
}: {
  label: string
  sublabel: string
  colorKey: ColorKey
  picks: FantasyPick[]
  renderPick: (p: FantasyPick) => React.ReactNode
  emptyMessage: string
}) {
  return (
    <section>
      <SectionHeader label={label} sublabel={sublabel} colorKey={colorKey} />
      {picks.length === 0 ? (
        <p className="text-sm text-stone-400 font-serif italic mt-6 py-8 text-center">
          {emptyMessage}
        </p>
      ) : (
        <div className="space-y-3 mt-6">
          {picks.map((p) => (
            <div key={p.id}>{renderPick(p)}</div>
          ))}
        </div>
      )}
    </section>
  )
}


/* ─── Card components ─────────────────────────────────────────────────── */

function CardShell({
  rank,
  headline,
  oneLine,
  rightSlot,
  gameSlug,
  colorKey,
}: {
  rank: number
  headline: string
  oneLine: string
  rightSlot: React.ReactNode
  gameSlug: string | null
  colorKey: ColorKey
}) {
  const c = COLOR_STYLES[colorKey]
  return (
    <article className={`bg-white border border-stone-200 border-l-2 ${c.accent} p-4 sm:p-5`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="font-mono text-stone-300 text-sm font-bold mt-0.5 shrink-0 w-4">
            {rank}.
          </div>
          <div className="min-w-0">
            <div className="font-serif font-semibold text-stone-900 leading-tight">
              {headline}
            </div>
            <p className="text-sm text-stone-600 mt-1 leading-relaxed font-serif italic">
              {oneLine}
            </p>
            {gameSlug && (
              <Link
                href={`/mlb/${gameSlug}`}
                className="inline-block mt-2 text-[10px] font-mono uppercase tracking-widest text-orange-600 hover:underline"
              >
                View full game preview →
              </Link>
            )}
          </div>
        </div>
        <div className="shrink-0">
          {rightSlot}
        </div>
      </div>
    </article>
  )
}

function StreamerCard({ pick, isPro }: { pick: FantasyPick; isPro: boolean }) {
  const d = pick.details ?? {}
  const tier = d.tier ?? 'viable'
  const tierBg =
    tier === 'strong' ? 'bg-emerald-600 text-white' :
    tier === 'viable' ? 'bg-yellow-400 text-stone-900' :
    'bg-stone-300 text-stone-600'

  return (
    <CardShell
      rank={pick.rank}
      headline={pick.headline}
      oneLine={pick.one_liner}
      gameSlug={pick.game_slug}
      colorKey="emerald"
      rightSlot={
        <div className="flex flex-col items-end gap-1.5">
          <span className={`text-[9px] font-mono font-bold uppercase tracking-wider px-2 py-1 ${tierBg}`}>
            {tier === 'strong' ? 'Strong stream' : 'Viable'}
          </span>
          {isPro && pick.signal_score && (
            <span className="text-[10px] font-mono text-stone-400">{Math.round(pick.signal_score)}/100</span>
          )}
        </div>
      }
    />
  )
}

function MoverCard({ pick, isPro }: { pick: FantasyPick; isPro: boolean }) {
  const d = pick.details ?? {}
  const swing = d.swing ?? 0
  const direction = d.direction ?? 'up'

  return (
    <CardShell
      rank={pick.rank}
      headline={pick.headline}
      oneLine={pick.one_liner}
      gameSlug={pick.game_slug}
      colorKey="orange"
      rightSlot={
        <div className="flex flex-col items-end gap-1">
          <div className={`text-2xl font-serif font-bold leading-none ${direction === 'up' ? 'text-emerald-600' : 'text-red-600'}`}>
            {direction === 'up' ? '↑' : '↓'} {Math.abs(swing).toFixed(0)}
          </div>
          <span className="text-[9px] font-mono uppercase tracking-widest text-stone-400">
            Edge swing
          </span>
          {isPro && d.previous_score != null && d.current_score != null && (
            <span className="text-[10px] font-mono text-stone-500 mt-1">
              {d.previous_score > 0 ? '+' : ''}{d.previous_score} → {d.current_score > 0 ? '+' : ''}{d.current_score}
            </span>
          )}
        </div>
      }
    />
  )
}

function FallerCard({ pick, isPro }: { pick: FantasyPick; isPro: boolean }) {
  const d = pick.details ?? {}
  return (
    <CardShell
      rank={pick.rank}
      headline={pick.headline}
      oneLine={pick.one_liner}
      gameSlug={pick.game_slug}
      colorKey="red"
      rightSlot={
        <div className="flex flex-col items-end gap-1">
          <span className="text-[9px] font-mono font-bold uppercase tracking-wider px-2 py-1 bg-red-600 text-white">
            ↓ Tough spot
          </span>
          {isPro && d.pitcher_quality != null && (
            <span className="text-[10px] font-mono text-stone-400 mt-1">
              Stuff: {Math.round(d.pitcher_stuff ?? 0)} · Quality: {Math.round(d.pitcher_quality)}
            </span>
          )}
        </div>
      }
    />
  )
}

function SleeperCard({ pick, isPro }: { pick: FantasyPick; isPro: boolean }) {
  const d = pick.details ?? {}
  const isRegression = d.regression === true
  return (
    <CardShell
      rank={pick.rank}
      headline={pick.headline}
      oneLine={pick.one_liner}
      gameSlug={pick.game_slug}
      colorKey="blue"
      rightSlot={
        <div className="flex flex-col items-end gap-1">
          <span className="text-[9px] font-mono font-bold uppercase tracking-wider px-2 py-1 bg-blue-600 text-white">
            ⊕ Sleeper
          </span>
          {isPro && isRegression && d.gap != null && (
            <span className="text-[10px] font-mono text-stone-400 mt-1">
              ERA-FIP gap: +{Number(d.gap).toFixed(2)}
            </span>
          )}
        </div>
      }
    />
  )
}


/* ─── Stat education ──────────────────────────────────────────────────── */

const STAT_GUIDES = [
  {
    stat: 'xFIP',
    full: 'Expected Fielding Independent Pitching',
    short: 'Better than ERA for predicting a pitcher\'s future.',
    why: 'ERA includes luck — bloopers, defensive errors, weird hops. xFIP strips that out and looks only at what the pitcher controls (Ks, walks, fly balls). A pitcher with 5.50 ERA but 3.80 xFIP is due for a correction.',
    fantasy: 'Use xFIP when scouring the waiver wire. The ERA might scare other managers off — your edge is knowing the underlying numbers are better.',
  },
  {
    stat: 'wRC+',
    full: 'Weighted Runs Created Plus',
    short: 'Park-adjusted offence rating. 100 = league average.',
    why: 'Counting stats like RBIs depend on teammates. wRC+ adjusts for park (Coors inflates everything; Petco crushes it) and league context. 120+ is genuinely elite. 80 or below means avoid in tough spots.',
    fantasy: 'Streaming hitters against weak lineups? Look at wRC+ over the last 30 days, not season stats. A team can be hot or cold in May regardless of their April.',
  },
  {
    stat: 'Whiff%',
    full: 'Percentage of swings that miss',
    short: 'How often hitters swing and don\'t make contact.',
    why: 'Strikeouts are the cleanest pitcher stat — they don\'t depend on defence or sequencing. Whiff% on a specific pitch (e.g. 38% whiff on a slider) tells you which pitch is doing the work. Elite is 32%+. League average is ~24%.',
    fantasy: 'When picking a streamer, look for pitchers with one elite whiff pitch (>30%). Even mediocre starters can rack up Ks against the right matchup.',
  },
  {
    stat: 'K/9',
    full: 'Strikeouts per nine innings',
    short: 'Pure strikeout rate. The fantasy pitcher\'s bread and butter.',
    why: 'In points leagues, strikeouts are usually worth more than wins. K/9 is your single best snapshot of strikeout upside — better than season totals (which favour innings-eaters) or rate stats.',
    fantasy: 'Compare K/9 over the last 3 starts vs season average. A starter trending up (10+ K/9 in their last 3) is often a buy-low before others notice.',
  },
  {
    stat: 'FIP',
    full: 'Fielding Independent Pitching',
    short: 'ERA-style stat that ignores everything but Ks, walks, and HRs.',
    why: 'FIP scales like ERA (3.50 is good, 5.00 is bad) but strips out the noise. ERA above FIP by 0.5+ means the pitcher has been unlucky — Sleeper material. ERA below FIP by 0.5+ means they\'ve been lucky and may regress.',
    fantasy: 'Our Sleepers section is built on this gap. We surface pitchers with ugly ERAs but FIPs that say their stuff is real.',
  },
  {
    stat: 'OPS',
    full: 'On-base Plus Slugging',
    short: 'The simplest "is this hitter good" number.',
    why: 'OBP + SLG. Captures both getting on base and hitting for power. Elite is .900+. Average is .720. Below .680 means a struggling bat. Use last-30-day OPS, not season — context matters.',
    fantasy: 'When deciding whether to bench a fantasy star against a tough pitcher, check their OPS vs that pitcher\'s handedness — left-handed hitters often have much lower OPS vs LHP.',
  },
]

function StatGuideCard({ guide }: { guide: typeof STAT_GUIDES[number] }) {
  return (
    <article className="bg-white border border-stone-200 p-5 hover:border-stone-300 transition">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h3 className="font-mono font-bold text-stone-900 text-base">{guide.stat}</h3>
        <span className="text-[10px] font-mono uppercase tracking-widest text-stone-400">
          {guide.full}
        </span>
      </div>
      <p className="text-sm font-serif font-semibold text-stone-800 leading-snug mb-3">
        {guide.short}
      </p>
      <p className="text-xs text-stone-600 leading-relaxed mb-3">
        {guide.why}
      </p>
      <div className="border-t border-stone-100 pt-3">
        <div className="text-[10px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-1">
          Fantasy use
        </div>
        <p className="text-xs text-stone-600 leading-relaxed italic">
          {guide.fantasy}
        </p>
      </div>
    </article>
  )
}
