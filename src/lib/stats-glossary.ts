// src/lib/stats-glossary.ts
//
// Content for /mlb/glossary — every stat this site actually surfaces on a
// chart, split into two tiers a reader already thinks in:
//   'standard'  — the box-score line: AVG/OBP/SLG, HR, ERA, etc. Counted
//                 directly from what happened.
//   'statcast'  — Statcast-tracked or Statcast-derived: bat speed, wOBA,
//                 exit velocity, run value, etc. Measured off the actual
//                 pitch/swing/ball flight, or modeled from it.
// Deliberately scoped to stats THIS SITE renders somewhere — not a
// from-scratch sabermetrics encyclopedia. Each entry says what it is, why
// it's worth trusting (or not), and points at a small shared diagram
// (see src/components/glossary/StatDiagrams.tsx) rather than a bespoke
// illustration per stat — the same handful of visual metaphors recur
// across related stats (actual-vs-expected, a bat/ball diagram, a count
// grid, a speed gauge, a percentile bar), which is also more legible than
// 28 one-off drawings a reader has to re-learn each time.

export type StatCategory = 'standard' | 'statcast'

export type VisualKey =
  | 'slash-line'
  | 'bat-path'
  | 'expected-vs-actual'
  | 'exit-velo-gauge'
  | 'count-grid'
  | 'percentile-bar'
  | 'none'

export type GlossaryStat = {
  slug: string
  category: StatCategory
  name: string
  shortDef: string
  detail: string
  trust: string // one line: sample-size / caveat guidance — "how much credence to take from it"
  visual: VisualKey
  seeAlso?: string[]
  usedIn?: string[] // plain-English pointer to where on the site this shows up
}

export const GLOSSARY_STATS: GlossaryStat[] = [
  // ───────────────────────── STANDARD ─────────────────────────
  {
    slug: 'avg',
    category: 'standard',
    name: 'Batting average (AVG)',
    shortDef: 'Hits divided by at-bats — the classic "how often does he get a hit" number.',
    detail: 'AVG only counts at-bats, so it ignores walks, hit-by-pitches, and sacrifices entirely — a batter who reaches base 5 times on 4 walks and 1 single in a game hits .333 that day even though he reached base every single time. It also treats a bloop single and a 450-foot double identically.',
    trust: 'Needs a real sample — under ~60 at-bats it is mostly luck on balls in play (see BABIP). A useful "does he make contact" number, a poor one for "how much does he produce."',
    visual: 'slash-line',
    seeAlso: ['obp', 'slg', 'babip'],
  },
  {
    slug: 'obp',
    category: 'standard',
    name: 'On-base percentage (OBP)',
    shortDef: 'How often a plate appearance ends with the batter on base — hits, walks, and hit-by-pitches all count.',
    detail: 'OBP answers "how often does this batter NOT make an out," which is closer to a hitter\'s real job than AVG. A patient hitter with a modest average but a high walk rate can carry a real offensive value AVG alone hides.',
    trust: 'More stable than AVG game-to-game since it has more qualifying events (walks included), and correlates more directly with runs scored.',
    visual: 'slash-line',
    seeAlso: ['avg', 'slg'],
  },
  {
    slug: 'slg',
    category: 'standard',
    name: 'Slugging percentage (SLG)',
    shortDef: 'Total bases (1 for a single, 2 for a double, 3 for a triple, 4 for a home run) divided by at-bats.',
    detail: 'SLG is AVG weighted by how far the ball went — a double counts twice as much as a single, a home run four times as much. It is the standard way to separate "hits singles" from "hits for power," and this site\'s bat-speed-vs-production read leans on it as the real-outcome side of that question.',
    trust: 'Same at-bat-count caveats as AVG apply — needs a real season sample before treating small differences as meaningful.',
    visual: 'slash-line',
    seeAlso: ['avg', 'iso', 'xslg'],
    usedIn: ['Bat speed vs. production correlation panel', 'Comprehensive leaderboards'],
  },
  {
    slug: 'ops',
    category: 'standard',
    name: 'OPS (On-base Plus Slugging)',
    shortDef: 'OBP + SLG added together — one number combining "gets on base" and "hits for power."',
    detail: 'OPS is a quick-and-dirty combined rate stat. Adding two percentages with different denominators isn\'t mathematically elegant (weighted stats like wOBA fix that), but OPS correlates well enough with real offensive value that it stayed the default "how good is this hitter, at a glance" number for two decades.',
    trust: 'Fine for a fast read; prefer wOBA/xwOBA when you actually want to rank hitters precisely.',
    visual: 'slash-line',
    seeAlso: ['obp', 'slg', 'woba'],
  },
  {
    slug: 'iso',
    category: 'standard',
    name: 'Isolated power (ISO)',
    shortDef: 'SLG minus AVG — extra-base power with the "did he get a hit at all" part stripped out.',
    detail: 'A hitter can have a modest average and still be a power threat, or a high average with almost no extra-base pop. ISO isolates that specifically: it\'s the average number of EXTRA bases per at-bat, so a hitter who\'s all singles scores near .000 here even with a good AVG.',
    trust: 'Same sample-size rules as SLG — it\'s derived from it.',
    visual: 'slash-line',
    seeAlso: ['slg', 'avg'],
  },
  {
    slug: 'babip',
    category: 'standard',
    name: 'BABIP (Batting Average on Balls In Play)',
    shortDef: 'Batting average counting only balls put in play — strikeouts and home runs excluded.',
    detail: 'League-average BABIP sits around .290-.300. A hitter running well above that is either hitting the ball unusually hard/well-placed, or riding good luck that tends to fade; well below it can mean bad luck OR genuinely weak contact. It\'s a diagnostic stat, not a value stat.',
    trust: 'Very noisy in small samples (a week of bloops or diving catches swings it hugely) — most useful as a "is this AVG sustainable" sanity check over a full season, not a stat to chase on its own.',
    visual: 'slash-line',
    seeAlso: ['avg'],
  },
  {
    slug: 'hr',
    category: 'standard',
    name: 'Home runs (HR)',
    shortDef: 'Balls hit out of play that score the batter (and every runner on base) immediately.',
    detail: 'The most visible counting stat in the sport, and the one this site is careful NOT to over-index on when judging a skill like bat speed — a home-run leaderboard is a leaderboard of who\'s already good at power, so correlating another stat against it double-counts the very thing you\'re trying to test.',
    trust: 'A counting stat, not a rate — always read alongside plate appearances/games played before comparing two players.',
    visual: 'none',
  },
  {
    slug: 'xbh',
    category: 'standard',
    name: 'Extra-base hits (XBH)',
    shortDef: 'Doubles + triples + home runs — every hit that isn\'t a single.',
    detail: 'A broader power measure than home runs alone: a hitter who racks up doubles into the gap without much home-run pop still shows up here. This site uses it as one of several outcomes tested against bat speed, since "does he hit for power" shouldn\'t be judged on homers alone.',
    trust: 'Counting stat — compare rates (XBH per PA), not raw totals, across players with different playing time.',
    visual: 'none',
    seeAlso: ['slg', 'hr'],
  },
  {
    slug: 'era',
    category: 'standard',
    name: 'ERA (Earned Run Average)',
    shortDef: 'Earned runs allowed per 9 innings pitched — the standard "how good is this pitcher" number.',
    detail: '"Earned" excludes runs that scored because of a fielding error, so ERA tries to isolate the pitcher\'s own performance from his defense behind him. It doesn\'t always succeed — a pitcher who allows a lot of hard contact that happens to find gloves can run a great ERA on borrowed time.',
    trust: 'Needs real innings (a good rule of thumb: 40-50+ IP) before it separates skill from small-sample variance.',
    visual: 'none',
  },
  {
    slug: 'whip',
    category: 'standard',
    name: 'WHIP (Walks + Hits per Inning Pitched)',
    shortDef: 'How many baserunners a pitcher allows per inning, on average.',
    detail: 'A direct measure of "how often is someone on base against this guy," independent of whether those runners actually score (which depends on what happens after — the next batter, a double play, etc.). A low-ERA pitcher with a high WHIP is often running on sequencing luck.',
    trust: 'Same innings-floor caveat as ERA.',
    visual: 'none',
  },
  {
    slug: 'k9',
    category: 'standard',
    name: 'K/9 (Strikeouts per 9 innings)',
    shortDef: 'How many strikeouts a pitcher averages over a full 9-inning workload.',
    detail: 'A rate stat so pitchers with different innings totals can be compared fairly. High K/9 correlates with swing-and-miss stuff — it\'s one of the more "sticky" pitching skills year to year, less dependent on defense or luck than ERA.',
    trust: 'Reasonably reliable even in moderate samples (a few starts) since strikeouts are a "pure" outcome — no defense or luck involved in whether one happens.',
    visual: 'none',
    seeAlso: ['bb9', 'hr9'],
  },
  {
    slug: 'bb9',
    category: 'standard',
    name: 'BB/9 (Walks per 9 innings)',
    shortDef: 'How many walks a pitcher averages over a full 9-inning workload.',
    detail: 'A command/control proxy — a pitcher who walks a lot of hitters is either missing the zone or working around contact he doesn\'t trust. Low BB/9 with high K/9 is the profile of a pitcher who\'s both missing bats and finding the zone.',
    trust: 'Similar reliability to K/9 — a real outcome, not luck-dependent, but still wants a real sample of innings.',
    visual: 'none',
    seeAlso: ['k9'],
  },
  {
    slug: 'hr9',
    category: 'standard',
    name: 'HR/9 (Home runs allowed per 9 innings)',
    shortDef: 'How many home runs a pitcher averages over a full 9-inning workload.',
    detail: 'Unlike K/9 and BB/9, this one has real luck baked in — a hard-hit fly ball on a cold, dead-air night might stay in the park; the same swing on a hot day with the wind blowing out leaves. Ballpark matters a lot too (some stadiums are simply easier to homer in).',
    trust: 'Noisier than K/9/BB/9 across a season — treat big swings with some skepticism unless the underlying contact quality (hard-hit rate, barrel%) backs it up.',
    visual: 'none',
  },

  // ───────────────────────── STATCAST / ADVANCED ─────────────────────────
  {
    slug: 'bat-speed',
    category: 'statcast',
    name: 'Bat speed',
    shortDef: 'How fast the sweet spot of the bat is moving at the moment it would meet the ball, in mph.',
    detail: 'Tracked directly off bat-sensor data (Statcast\'s bat-tracking system), not estimated. It measures pure swing speed — nothing about WHERE the bat meets the ball, or whether the swing was well-timed. A fast swing that\'s late or off-center still produces weak contact, which is exactly why this site tests bat speed against actual outcomes rather than assuming faster automatically means more power.',
    trust: 'A real, precisely measured number even in small samples (it\'s tracked on every competitive swing), but a weak predictor of production ON ITS OWN — see the correlation panel on the bat-speed page for how weak, with real numbers.',
    visual: 'bat-path',
    seeAlso: ['swing-length', 'squared-up', 'miss-distance'],
    usedIn: ['Bat speed vs. production radar & neural scatter', 'Miss distance table'],
  },
  {
    slug: 'swing-length',
    category: 'statcast',
    name: 'Swing length',
    shortDef: 'How far (in inches) the bat head travels from the start of the swing to contact (or the point of a miss).',
    detail: 'A shorter, more compact swing generally gets to the ball faster and has less room for timing error; a longer swing can generate more bat speed at the cost of a smaller margin for error on timing. Neither is automatically "better" — it\'s a swing-mechanics tradeoff, not a value judgment.',
    trust: 'Real per-swing measurement, reliable even in small samples — the judgment about whether a given length is "good" for a player depends on the rest of his profile.',
    visual: 'bat-path',
    seeAlso: ['bat-speed', 'miss-distance'],
  },
  {
    slug: 'miss-distance',
    category: 'statcast',
    name: 'Miss distance',
    shortDef: 'On a swing-and-miss, how far (in inches) the bat\'s sweet spot passed from the center of the ball.',
    detail: 'A direct measure of how close a whiff actually was — a half-inch miss is a very different swing than a swing that missed the ball by a foot. Broken down by pitch type on this site, since a hitter\'s miss pattern often varies a lot by what he\'s swinging at (missing sliders by more than fastballs is a common, real signal).',
    trust: 'Needs a real number of whiffs on a SPECIFIC pitch type before its average means much — a pitch type with only 2-3 recorded whiffs is filtered out of the per-pitch breakdown on this site for exactly that reason.',
    visual: 'bat-path',
    seeAlso: ['bat-speed', 'swing-length'],
    usedIn: ['Miss distance table (by pitch type, season & last 30 days)'],
  },
  {
    slug: 'squared-up',
    category: 'statcast',
    name: 'Squared-up rate',
    shortDef: 'The share of swings where the bat met the ball close to the sweet spot, converting close to the swing\'s full bat speed into exit velocity.',
    detail: 'A swing can be fast without being SQUARED UP — mistiming or an off-center hit bleeds bat speed away instead of transferring it to the ball. This is Statcast\'s own measure of "quality of contact, independent of how hard he swung," which is part of why raw bat speed alone is such an incomplete predictor of production.',
    trust: 'A real per-swing measurement; like most rate stats here, wants a real number of competitive swings (not just a handful) before treating small differences as meaningful.',
    visual: 'bat-path',
    seeAlso: ['bat-speed'],
  },
  {
    slug: 'woba',
    category: 'statcast',
    name: 'wOBA (weighted On-Base Average)',
    shortDef: 'A single rate stat that weights every outcome (walk, single, double, HR, etc.) by its ACTUAL average run value, instead of treating them as interchangeable the way OBP does.',
    detail: 'OBP counts a walk and a home run as the same "on base" event; wOBA doesn\'t — it weights each outcome by how many runs it\'s actually worth on average, derived from real run-expectancy data. It\'s scaled to look like OBP (league average sits around .310-.320) so it\'s easy to read at a glance.',
    trust: 'The best single rate stat here for "how much value did this hitter actually produce" — still wants a real plate-appearance sample (a few hundred+) before small gaps are meaningful.',
    visual: 'expected-vs-actual',
    seeAlso: ['xwoba', 'ops'],
    usedIn: ['Contact-quality ("loud outs") scatter', 'Bat speed radar\'s Production axis'],
  },
  {
    slug: 'xwoba',
    category: 'statcast',
    name: 'xwOBA (expected wOBA)',
    shortDef: 'What a hitter\'s wOBA SHOULD be, based only on the exit velocity and launch angle of every ball he put in play — physics, not what actually happened to it.',
    detail: 'Two balls hit with identical exit velocity and launch angle should, on average, produce the same outcome — but real fielders, real ballparks, and real luck mean one becomes a double and the other becomes a lineout right at someone. xwOBA strips all of that out and asks "given how well this was actually hit, what SHOULD have happened on average?"',
    trust: 'Real xwOBA meaningfully above real wOBA over a full season = getting unlucky (hitting the ball well, results not showing it yet); real wOBA well above xwOBA = running hot, results may cool off. Needs a real batted-ball sample (~100+) to trust the gap.',
    visual: 'expected-vs-actual',
    seeAlso: ['woba'],
    usedIn: ['Contact-quality ("loud outs") scatter — xwOBA minus wOBA is the y-axis'],
  },
  {
    slug: 'xslg',
    category: 'statcast',
    name: 'xSLG (expected slugging)',
    shortDef: 'What a hitter\'s SLG should be based on the exit velocity and launch angle of his batted balls alone.',
    detail: 'The slugging-specific sibling of xwOBA — same physics-only logic, scaled to read like SLG. Because it strips out defense, ballpark, and luck, it\'s the fairer of the two SLG numbers to correlate against a swing-mechanics input like bat speed (the correlation panel on the bat-speed page shows both, side by side, for exactly this reason).',
    trust: 'Same sample-size guidance as xwOBA.',
    visual: 'expected-vs-actual',
    seeAlso: ['slg', 'xwoba'],
    usedIn: ['Bat speed vs. production correlation panel'],
  },
  {
    slug: 'xba',
    category: 'statcast',
    name: 'xBA (expected batting average)',
    shortDef: 'What a hitter\'s batting average should be based on the exit velocity, launch angle (and on some balls, sprint speed) of what he put in play.',
    detail: 'Same physics-only family as xwOBA/xSLG, scaled to read like AVG. Useful for spotting a hitter who\'s hitting the ball well but running into bad luck (or great defense) on balls that should be falling in.',
    trust: 'Same batted-ball sample-size guidance as the rest of the "x-stat" family.',
    visual: 'expected-vs-actual',
    seeAlso: ['avg', 'xwoba'],
  },
  {
    slug: 'exit-velocity',
    category: 'statcast',
    name: 'Exit velocity (EV)',
    shortDef: 'How fast the ball is moving off the bat, in mph, the instant after contact.',
    detail: 'The most direct measure of "how hard did he hit that." Correlates strongly with outcome — harder-hit balls fall for hits and go for extra bases far more often — which makes it one of the more trustworthy single Statcast numbers on this site, averaged here across every ball a batter actually puts in play.',
    trust: 'Reliable even in a moderate sample (it\'s measured directly, not estimated) — the standard "hard-hit" threshold is 95mph, used throughout this site\'s charts.',
    visual: 'exit-velo-gauge',
    seeAlso: ['hard-hit-rate', 'barrel-pct'],
    usedIn: ['Bat speed vs. production correlation panel', 'Pitch count grid ("Hard-hit rate" view)'],
  },
  {
    slug: 'hard-hit-rate',
    category: 'statcast',
    name: 'Hard-hit rate',
    shortDef: 'The share of batted balls hit at 95mph exit velocity or harder — Statcast\'s own published threshold.',
    detail: 'A simple, well-established cutoff that turns exit velocity into a rate stat: what percentage of the time does this hitter (or, in the pitch-count grid, this pitcher\'s pitches) get hit hard. League-average sits in the mid-30s to low-40s percent range.',
    trust: 'Needs a real number of batted balls (a few dozen+) before the rate is meaningful — a single loud contact game can swing a small-sample rate a lot.',
    visual: 'exit-velo-gauge',
    seeAlso: ['exit-velocity', 'barrel-pct'],
    usedIn: ['Pitch count grid'],
  },
  {
    slug: 'barrel-pct',
    category: 'statcast',
    name: 'Barrel%',
    shortDef: 'The share of batted balls hit in the specific combination of exit velocity AND launch angle that has historically produced a .500+ AVG and 1.500+ SLG.',
    detail: 'A "barrel" isn\'t just hard-hit — it\'s hard-hit AT THE RIGHT ANGLE. A 105mph line drive at the wrong angle isn\'t a barrel; a well-placed 99mph fly ball at the ideal loft can be. It\'s Statcast\'s own name for "the best possible way to hit a baseball," defined from real outcome data, not a subjective eyeball call.',
    trust: 'Naturally a smaller share of all batted balls than hard-hit rate, so it needs a bigger sample to trust — treat single-digit percentage-point gaps with caution in anything under a full season.',
    visual: 'exit-velo-gauge',
    seeAlso: ['hard-hit-rate', 'exit-velocity'],
  },
  {
    slug: 'sweet-spot-pct',
    category: 'statcast',
    name: 'Sweet-spot%',
    shortDef: 'The share of batted balls hit at a launch angle between 8° and 32° — the range that produces hits most often, independent of exit velocity.',
    detail: 'Where barrel% needs BOTH speed and angle, sweet-spot% is just about angle — a hitter who consistently finds this launch window is doing something repeatable and skill-based with his swing plane, even before you ask how hard he\'s hitting it.',
    trust: 'Same batted-ball sample-size guidance as barrel%/hard-hit rate.',
    visual: 'exit-velo-gauge',
    seeAlso: ['barrel-pct'],
  },
  {
    slug: 'run-value',
    category: 'statcast',
    name: 'Run value (delta run expectancy)',
    shortDef: 'How much a single pitch changed the batting team\'s expected runs for the rest of the inning, based on the resulting ball-strike count and outcome.',
    detail: 'Every base-out state in baseball has a known historical run expectancy (e.g. "runner on 2nd, 1 out" scores X runs on average the rest of that inning). Run value is simply the CHANGE in that expectancy caused by one pitch. On this site, negative = good for the pitcher (suppresses the batting team\'s run expectancy); positive = good for the hitter — shown per pitch type, per count.',
    trust: 'A single pitch\'s run value is nearly meaningless alone — it only becomes informative averaged over many pitches at the same count/pitch-type combination, which is why this site filters out any count with fewer than 6 recorded pitches of a given type.',
    visual: 'count-grid',
    seeAlso: ['hits-allowed', 'runs-allowed'],
    usedIn: ['Pitch run-value by count grid'],
  },
  {
    slug: 'hits-allowed',
    category: 'statcast',
    name: 'Hits allowed (by count)',
    shortDef: 'Singles, doubles, triples, and home runs given up, broken down by the exact ball-strike count and pitch type thrown.',
    detail: 'Raw contact damage, independent of exit velocity or luck — pairs well with hard-hit rate (a pitch can get hit hard without giving up a hit, or vice versa). Summed across every pitch type shown, this total is built to reconcile exactly with the pitcher\'s official season hit total — hits are always credited to the specific pitch that was put in play, with no attribution ambiguity the way runs allowed sometimes has.',
    trust: 'The grid only displays counts thrown at least 6 times for legibility, but the season TOTAL column sums every count actually recorded (not just the ones shown), so it stays accurate even for rare counts.',
    visual: 'count-grid',
    seeAlso: ['run-value', 'runs-allowed'],
    usedIn: ['Pitch count grid ("Hits allowed" view)'],
  },
  {
    slug: 'runs-allowed',
    category: 'statcast',
    name: 'Runs allowed (by count)',
    shortDef: 'Runs that scored on plays following a given pitch/count, broken down by pitch type.',
    detail: 'Close to "RBI given up" but not identical — it also counts runs that score via a fielding error or wild pitch, which official RBI scoring excludes. Useful for spotting which specific counts have actually cost a pitcher runs, not just which ones look bad in the abstract.',
    trust: 'Can run a little under the pitcher\'s official season runs-allowed total even with every pitch type shown — official run totals also charge a pitcher for "bequeathed runners" who score off a RELIEVER after he exits the game, which can\'t show up in his own pitch log. That\'s a real scoring rule, not missing data.',
    visual: 'count-grid',
    seeAlso: ['hits-allowed', 'run-value'],
    usedIn: ['Pitch count grid ("Runs allowed" view)'],
  },
  {
    slug: 'whiff-rate',
    category: 'statcast',
    name: 'Whiff / swing-and-miss rate',
    shortDef: 'The share of swings that miss the ball entirely.',
    detail: 'A direct swing-and-miss measure, separate from strikeouts (a strikeout can happen on a called third strike with no swing at all). High whiff rate against a specific pitch usually means that pitch\'s shape or location is fooling hitters badly.',
    trust: 'Wants a real number of competitive swings against the specific pitch/count being measured — small samples are noisy.',
    visual: 'count-grid',
    seeAlso: ['miss-distance'],
  },
  {
    slug: 'abs-success-rate',
    category: 'statcast',
    name: 'ABS challenge success rate',
    shortDef: 'The share of a player\'s Automated Ball-Strike challenges that get the original call overturned.',
    detail: 'Not luck — a challenge only succeeds if the automated strike-zone review actually disagrees with the umpire, so a high success rate reflects genuinely good pitch-recognition (batters) or genuinely good called-pitch reads (catchers/pitchers), not random variance the way, say, a hot BABIP stretch can be.',
    trust: 'This site applies a minimum-challenge floor before ranking anyone on success rate — below that, a small handful of challenges can produce a misleadingly extreme rate (2-for-2 reads as "100%" but tells you almost nothing).',
    visual: 'percentile-bar',
    seeAlso: [],
    usedIn: ['ABS Challenges radar & leaderboard'],
  },
  {
    slug: 'percentile-rank',
    category: 'statcast',
    name: 'Percentile rank',
    shortDef: 'Where a player sits relative to every other qualified player in the same pool, on a 0-100 scale — 50th is exactly average, 90th means he beats 90% of the field.',
    detail: 'This site ranks every radar axis this way (Savant does the same on player pages) instead of showing raw numbers, because raw numbers on different scales (mph vs. a decimal rate vs. inches) can\'t be compared to each other directly — percentile puts everything on one common, comparable scale.',
    trust: 'Only as reliable as the underlying cohort it\'s ranked against — a percentile computed against 15 players reads very differently than one computed against 100+, which is part of why widening these pools matters.',
    visual: 'percentile-bar',
    seeAlso: [],
    usedIn: ['Every radar chart & Savant-style percentile bar on this site'],
  },
]

export const CATEGORY_LABEL: Record<StatCategory, string> = {
  standard: 'Standard',
  statcast: 'Statcast / Advanced',
}

export function getStatBySlug(slug: string): GlossaryStat | undefined {
  return GLOSSARY_STATS.find(s => s.slug === slug)
}
