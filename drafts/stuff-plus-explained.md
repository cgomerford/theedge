# Stuff+ explained: how a front office grades a pitch before the results come in

*The Edge · Front Office primer*

**The question:** Is this pitcher actually good, or has he just been lucky?

An ERA tells you what happened. It does not tell you why. A pitcher can post a 2.80 ERA because his fastball is elite, or because every ball in play found a glove for six weeks. A front office needs to know which, because one of those is a skill it can count on and the other is a month of weather.

Stuff+ is one of the tools analysts use to answer that. It grades the pitch itself, before a hitter or a defender gets involved.

## What Stuff+ is

Stuff+ is a single number for how good a pitch's physical qualities are. It looks at things the pitcher controls and the camera can measure:

- **Velocity**: how hard it is thrown.
- **Movement**: how much it moves horizontally and vertically, and how tha.  t compares with what a pitch at that speed usually does.
- **Spin**: how much, and the direction of the spin axis.
- **Release**: where the ball leaves the hand, and how far down the mound the pitcher gets (extension).

A model learns how pitches with those qualities tend to fare against hitters across a whole league, then scores each pitch against that. Crucially, it does not look at whether this particular pitch got hit. It grades the ingredients, not the meal.

## How to read the number

On the common scale, **100 is league average**. Higher is better. Roughly, every 10 points is one standard deviation, so a 110 pitch is clearly above average and a 90 pitch is clearly below.

Two things to keep in mind:

- **It is graded per pitch type.** A pitcher has a Stuff+ for his fastball, another for his slider, another for his changeup. The overall number blends them by how often he throws each.
- **It is not a measure of results.** A high Stuff+ with a poor ERA is not a contradiction. It is exactly the situation an analyst wants to look at.

## Why front offices like it

**It settles quickly.** Results like ERA take a full season or more to mean much. The physical qualities of a pitch show up almost immediately, so a few starts can already say something. That is the idea behind the Signal Meter on The Edge: every number has a point where the sample is big enough to trust, and for pitch quality that point arrives early. A common working figure is around 80 pitches of a given type.

**It catches changes.** A new grip, a mechanical tweak or a few extra inches of movement shows up in Stuff+ before it shows up in the box score. That makes it a good way to spot a pitcher who has changed.

**It separates skill from luck.** If a pitcher's results are poor but his pitches grade well, the gap is worth investigating. If his results are great but his pitches grade poorly, the front office asks what is holding it up.

## What Stuff+ does not tell you

- **Where the pitch goes.** A great pitch in the middle of the plate is still a hittable pitch. Command and location are a separate question, and analysts grade them separately (often called Location+, with a combined Pitching+).
- **How he sequences.** Mixing pitches, setting up hitters and avoiding patterns are not in the physical grade.
- **Who he is facing, or the situation.** It grades the pitch, not the matchup.
- **Everything about durability.** A pitcher whose velocity is falling off will see it in the number, but the number does not explain why.

Think of it as one input. It is strongest when set beside what actually happened.

## How a front office uses it

1. **Find the gap.** Pitchers whose pitch grades are well ahead of their results are the ones an analyst looks at first.
2. **Check the sample.** Has he thrown enough of each pitch for the grade to have settled?
3. **Look for the reason.** Is it location, sequencing, a change in role, or just bad luck on balls in play?
4. **Weigh the cost.** Then ask what that pitcher costs, and for how many years.

That is the same way of thinking behind the tools in Front Office: how a roster was built, whose process is ahead of his results, and when a number becomes trustworthy.

## The short version

- Stuff+ grades a pitch on its physical qualities, not its results.
- 100 is average; higher is better.
- It settles early, so it can be read sooner than ERA.
- It does not cover location, sequencing or matchup.
- Use it to ask better questions about a pitcher, then check the answers against the results.

*Source and method: Stuff+ is a publicly published family of pitch-quality models built on Statcast tracking data. The Edge will publish its own pitch-quality grades, with the method, when that model is live.*
