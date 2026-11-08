// src/lib/pitch-shape/stat-info.ts
//
// One plain-language definition per stat the Pitch Shape Lab shows, used by the little "i" hover (InfoTip). Each says what the number is, how to read it, and one caution. Descriptions of what
// already happened, never forecasts. Keys are stable ids; the label on the page does not have to match.

export type StatInfo = { title: string; what: string; read?: string; caution?: string }

export const STAT_INFO = {
  ride: { title: 'Ride (induced vertical break)', what: 'How many inches the pitch rises, or drops less, than a pitch thrown with no spin would. Measured from Statcast’s tracking.', read: 'Higher means more “rise”: a four-seam with 18+ in of ride stays up through the zone. A sinker or changeup has less.', caution: 'It is the pitch’s path, not a result: a high-ride pitch is not automatically a good one.' },
  run: { title: 'Run (horizontal break)', what: 'How many inches the pitch moves sideways from the pitcher’s point of view, compared with a spin-free path.', read: 'Positive is toward his arm side, negative toward his glove side; it is shown from the pitcher’s side, not the catcher’s.', caution: 'Left- and right-handers are plotted on separate maps, so sideways movement is not mirrored.' },
  velo: { title: 'Velocity', what: 'The speed of the pitch as it leaves the hand, in miles per hour, averaged over his pitches of this type.', read: 'Compared with the average for the same pitch type.', caution: 'Speed alone does not say how a pitch plays: shape, location and sequencing matter as well.' },
  armSlot: { title: 'Arm slot', what: 'The angle of the arm at release, in degrees: lower numbers are a more sidearm release, higher numbers more over the top.', read: 'Pitches that move the same can behave differently from different slots.', caution: 'Taken from Savant’s tracking where it is recorded; never estimated, so it can be blank.' },
  shapeScore: { title: 'Shape Score', what: 'A 1 to 99 rank of how well pitches shaped like this one have done: the runs allowed per 100 pitches by every pitch of the type within the window of this ride and run, ranked against other shapes.', read: '99 is the best results any shape has produced, 50 is average, 1 the worst.', caution: 'It rates the shape, not the pitcher, and needs at least 300 pitches in the window. It describes what already happened.' },
  runsSaved: { title: 'Runs saved per 100 pitches', what: 'Runs kept off the board per 100 pitches compared with the average pitch of that type. Higher is better for the pitcher; zero is average.', read: '+1.00 is one run fewer than average for every 100 pitches.', caution: 'It includes location, sequencing, the hitters faced, defense and luck, not only movement. See “What is runs saved?” for the arithmetic.' },
  runs100: { title: 'Runs allowed per 100 pitches', what: 'The summed change in expected runs on these pitches, divided by the pitches, times 100. Lower is better for the pitcher.', caution: 'The same number as runs saved with the sign flipped and measured from zero rather than from the average.' },
  woba: { title: 'wOBA against', what: 'Weighted on-base average on plate appearances that ended with this pitch: every outcome weighted by the runs it is worth, on the scale of on-base percentage. Lower is better for the pitcher.', read: 'Around .315 to .320 is the MLB average.', caution: 'Only counts plate appearances that ended on the pitch, so a pitch used mostly to get ahead in the count shows few.' },
  xwoba: { title: 'xwOBA against', what: 'Expected wOBA: what the contact and strikeouts and walks on these pitches would usually produce, from exit speed, launch angle and (for some) sprint speed, ignoring the defense and ballpark.', read: 'Higher than the real wOBA means he was a little lucky; lower means unlucky.', caution: 'A model of contact quality, not a record of what happened.' },
  avg: { title: 'Batting average against', what: 'Hits divided by at-bats on at-bats that ended with this pitch. Lower is better for the pitcher.', caution: 'Ignores walks and extra bases, so it is the roughest of the results measures.' },
  slg: { title: 'Slugging against', what: 'Total bases divided by at-bats on at-bats that ended with this pitch: how much damage hitters did when they put it in play. Lower is better for the pitcher.', caution: 'Home runs on a small sample swing it a lot.' },
  whiff: { title: 'Whiffs per swing', what: 'Swings and misses divided by all swings at this pitch.', read: 'Higher is better for the pitcher. The MLB average is around 25% to 30%, higher for breaking balls.', caution: 'A pitch can miss bats and still get hit hard when it is hit: read it with the damage measures.' },
  gap: { title: 'Gap to his shape', what: 'His own runs saved per 100 pitches minus what the shape has produced for everyone who throws it.', read: 'Positive: his results beat the shape. Negative: they trail it.', caution: 'A gap can be location, sequencing, defense or luck, and a small sample moves it a lot.' },
  carry: { title: 'Does the shape carry to MLB?', what: 'Whether pitches shaped like his, at his speed, worked at this level and whether they have worked in MLB.', read: '“Works here, not in MLB” means the shape has done well in the minors but not at the top level.', caution: 'MLB hitters are better and the scales differ, so it flags a difference; it does not say what he will do.' },
  window: { title: 'Window (± inches)', what: 'How far from a box on the map a pitch can be, in ride and run, and still count as having “the same shape”.', read: '±1 in is tight; ±2 or ±3 in gathers more pitches and smooths small samples.', caution: 'A wider window blends shapes together.' },
  leaguePitches: { title: 'League pitches', what: 'Which seasons of league pitches the map and the results are built from.', caution: 'More seasons means a steadier read, but older seasons may not match how pitches are thrown now.' },
  pitches: { title: 'Pitches', what: 'How many pitches of this type, thrown by this pitcher, are behind the numbers.', caution: 'Under about 300 the results are noisy.' },
  share: { title: 'Share', what: 'The part of his pitches that are this type.' },
  pa: { title: 'Plate appearances ended', what: 'The number of plate appearances that finished on these pitches. It is the sample behind wOBA, xwOBA, average and slugging.' },
  era: { title: 'ERA', what: 'Earned runs allowed per nine innings.', caution: 'Depends on defense, ballpark and sequencing as well as the pitcher.' },
  xera: { title: 'xERA', what: 'The ERA his batted balls, strikeouts and walks would usually give, from Statcast’s expected stats.', read: 'Below his ERA means he has been a little unlucky; above means lucky.' },
  fip: { title: 'FIP', what: 'Fielding-independent pitching: an ERA-style number built only from strikeouts, walks, hit batters and home runs.', caution: 'Ignores how hard balls in play were hit.' },
  whip: { title: 'WHIP', what: 'Walks plus hits per inning pitched.' },
  kPct: { title: 'K%', what: 'The share of plate appearances that ended in a strikeout.' },
  bbPct: { title: 'BB%', what: 'The share of plate appearances that ended in a walk.' },
  variation: { title: 'Variation (SD)', what: 'How much his own pitches of this type differ from his average, in inches (standard deviation). Smaller means the pitch moves the same way each time.', caution: 'Tracking noise adds a little to every pitcher’s figure.' },
  zone: { title: 'Zone', what: 'The share of his pitches of this type thrown in the strike zone.' },
  chase: { title: 'Chase', what: 'The share of his pitches of this type thrown outside the zone that hitters swung at. Higher is better for the pitcher.' },
  level: { title: 'Level', what: 'Major league, Triple-A or the Florida State League (Single-A). Each is measured against its own league, not against MLB.' },
  shapeRank: { title: 'Shape rank at this level', what: 'The Shape Score (1 to 99) for his shape using only pitches at this level.', caution: 'Not on the MLB scale.' },
  closest: { title: 'Closest MLB shape', what: 'MLB pitchers whose average ride, run and speed are nearest his, with the results those pitches have had in MLB.', caution: 'Closeness is physical only; it does not say he will get the same results.' },
  mlbCareer: { title: 'MLB career', what: 'Whether he has pitched in MLB, and when, from the MLB Stats API debut date and this season’s MLB pitch counts.' },
  mlbResults: { title: 'MLB results this season', what: 'His runs allowed per 100 pitches in MLB this season against the MLB average. “Struggled” is 0.3 or more runs worse, with at least 150 MLB pitches.' },
} satisfies Record<string, StatInfo>

export type StatKey = keyof typeof STAT_INFO
