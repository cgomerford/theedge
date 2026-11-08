// src/lib/contact-shape/info.ts
//
// Plain-language definitions for the hover (i) beside each Contact Shape stat. What it is, how to read it, one caution. Descriptions of what already happened, never forecasts.

import type { StatInfo } from '@/lib/pitch-shape/stat-info'

export const CONTACT_INFO = {
  ev: { title: 'Exit velocity', what: 'How fast the ball left the bat, in miles per hour, measured by Statcast the moment after contact.', read: 'Up the side of the map. Harder-hit balls are more likely to be hits and to go for extra bases.', caution: 'Speed alone is not enough: a 105 mph ball hit into the ground is still usually a ground-out.' },
  la: { title: 'Launch angle', what: 'The vertical angle the ball left the bat, in degrees. Below 0 is into the ground, about 10 to 25 a line drive, 25 to 50 a fly ball, over 50 a pop-up.', read: 'Along the bottom of the map.', caution: 'The best angle depends on the speed: harder-hit balls can go further up and still be dangerous.' },
  avgEv: { title: 'Average exit velocity', what: 'The mean exit velocity of his batted balls in the season shown.', caution: 'Includes weak contact and bunts-in-play with a recorded speed; it is an average, so a few very hard balls and a few soft ones can lie behind the same number.' },
  maxEv: { title: 'Hardest ball', what: 'His single hardest recorded batted ball in the season shown.', caution: 'One ball. Read it as a ceiling, not as his typical contact.' },
  hardHit: { title: 'Hard-hit rate', what: 'The share of his batted balls hit 95 mph or harder.', read: 'The league figure is shown beside it for the same season.' },
  sweetSpot: { title: 'Sweet-spot rate', what: 'The share of his batted balls with a launch angle from 8° to 32°, the band where line drives and low fly balls live.', caution: 'It is about angle only, so it counts weak contact at a good angle too.' },
  barrel: { title: 'Barrel rate', what: 'The share of his batted balls hit hard enough, at a good enough angle, to be a barrel: 98 mph or more with an angle band that widens as the speed goes up (26° to 30° at 98 mph, 8° to 50° at 116).', caution: 'This page applies the published rule to the recorded speed and angle, so it can differ slightly from Savant’s own barrel count.' },
  xwoba: { title: 'xwOBA on contact', what: 'The average expected weighted on-base average of his batted balls, from their exit speed and launch angle (what balls hit like that have usually produced), ignoring defense and ballpark.', read: 'Around .360 is the league average on contact.', caution: 'It measures the contact only (no walks or strikeouts), so it is not the same as his overall xwOBA.' },
  hitRate: { title: 'Hit rate on balls in play', what: 'The share of his batted balls that fell for a hit (single, double, triple or home run).', caution: 'It includes defense and luck: a well-hit ball caught is an out here.' },
  gb: { title: 'Ground balls', what: 'The share of his batted balls with a launch angle under 10°.' },
  ld: { title: 'Line drives', what: 'The share of his batted balls with a launch angle from 10° to 25°.' },
  fb: { title: 'Fly balls', what: 'The share of his batted balls with a launch angle from 25° to 50°.' },
  pu: { title: 'Pop-ups', what: 'The share of his batted balls with a launch angle over 50°.' },
  balls: { title: 'Batted balls', what: 'Balls he put in play in the regular season with a recorded exit velocity and launch angle.', caution: 'Fewer than about 150 and the rates move a lot from one ball to the next.' },
  mapLeague: { title: 'Compared with the league', what: 'Each box shows the share of his batted balls that land there minus the share of all league batted balls that land there. Orange means he hits more balls there than the league does; blue, fewer.' },
  mapDots: { title: 'Every batted ball', what: 'Each dot is one batted ball, orange if it fell for a hit and grey if it did not. The background shows what the league’s balls in that box have produced (expected wOBA): darker is better for the hitter.' },
  mapDensity: { title: 'Where his contact lands', what: 'The share of his own batted balls that land in each box. Darker means more of his balls land there.' },
  zone: { title: 'Contact box', what: 'A range of exit speeds and launch angles you choose. The figures show how many of his batted balls fall in it and what they produced, next to the league’s balls in the same box.' },
  sample: { title: 'Sample', what: 'The number of batted balls behind a figure. Boxes with fewer than three balls are left blank for quality measures: a rate from two balls is not a read.' },
} satisfies Record<string, StatInfo>
export type ContactInfoKey = keyof typeof CONTACT_INFO
