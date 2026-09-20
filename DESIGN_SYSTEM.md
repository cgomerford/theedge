# DESIGN_SYSTEM.md — The Edge

The look and structure used on the redesigned **MLB team page**, **MLB player page**
and the **Pro Statcast trends** tab. **Use this for every new sport and page — NFL
first.** It is written from the shipped code, not from a mockup; when this file and
the code disagree, the code (`src/components/team/ui.tsx`) wins and this file should be fixed.

Referenced from `CLAUDE.md` §6.

---

## 1. Fonts — the rule

| Role | Font | Where it is used |
|---|---|---|
| **Base text, ALL headers, ALL bold, big numbers** | **Outfit** (the rounded brand face; free stand-in for Effra) | body copy, section titles, hero names, stat-tile values, table names, bold values, rank chips, card titles, `<b>` / `<strong>` |
| **Light labels & plain numbers** | **JetBrains Mono** | small uppercase kickers, axis ticks, footnotes, non-bold table numbers, tab labels |
| ~~Bebas Neue~~ | **not used on new pages** | it was the old display face (condensed all-caps). Do not use it for headers |
| ~~Fraunces~~ | **not used on new pages** | it was the old serif. Do not use it for body, headers or "italic notes" |

**Headers and bold are rounded (Outfit), never condensed caps and never mono.**
If something is bold or a heading, it is Outfit at weight 700–800.

### How fonts are wired (do not get this wrong)

Fonts are loaded once in `src/app/layout.tsx` with `next/font` and exposed as CSS variables:

```
--font-outfit     → Outfit        (also --font-sans in globals.css; the sitewide default)
--font-jetbrains  → JetBrains Mono (--font-mono)
```

**Always reference the variables, never a literal family name.** `next/font` hashes its
family names, so `fontFamily: 'Fraunces, serif'` or `'JetBrains Mono'` as a string
silently falls back to the system font (this shipped broken once).

In code, import the constants — do not retype them:

```ts
import { SANS, MONO, DISPLAY, DISPLAY_WEIGHT, C } from '@/components/team/ui'
// SANS    = 'var(--font-outfit), system-ui, sans-serif'
// MONO    = 'var(--font-jetbrains), ui-monospace, monospace'
// DISPLAY = SANS          (headers/big numbers use Outfit…)
// DISPLAY_WEIGHT = 800    (…at heavy weight; every DISPLAY use sets fontWeight: 800)
```

### Type scale used on the new pages

| Use | Style |
|---|---|
| Hero name | Outfit 800, `clamp(34px, 5.6vw, 56px)`, letter-spacing `-0.02em`, line-height 1 |
| Section title (`§ 01 …`) | Outfit 800, 30px, letter-spacing `-0.01em` |
| Stat tile / hero stat value | Outfit 800, 26–30px, tabular numbers |
| Card title / kicker | small caps, 10px, letter-spacing `.14em`, **bold → Outfit**, orange |
| Body / descriptions | Outfit 13–15px, colour `#5b5347` |
| Footnotes / sources | JetBrains Mono 9.5px, `#a89e8c` |
| Data numbers in tables | Mono is fine when not bold; **bold values are Outfit** with `fontVariantNumeric: 'tabular-nums'` |

### Embedded / legacy components

Older components (GradeBanner, SignatureSummary, CareerTable, …) use Tailwind
`font-serif` / `font-bold`. Wrap the page root in `className="tp-root"` and include this
rule so they follow the same faces without editing each one:

```css
.tp-root b, .tp-root strong, .tp-root h1, .tp-root h2, .tp-root h3,
.tp-root .font-bold, .tp-root .font-semibold, .tp-root .font-black, .tp-root .font-serif {
  font-family: var(--font-outfit), system-ui, sans-serif !important;
  font-variant-numeric: tabular-nums;
}
```

(`TeamPage.tsx` and `PlayerPageClient.tsx` both do this.)

---

## 2. Colour

```ts
C = { cream: '#FAF8F3', card: '#fff', line: '#e7e2d8', soft: '#f1eee6', ink: '#1A1A1A',
      mute: '#8a8275', faint: '#a89e8c', orange: '#FF5722', yellow: '#FDE047',
      good: '#1D9E75', bad: '#D4533B' }
```

- Page background cream `#FAF8F3`; cards white with a `1px #e7e2d8` border.
- **Hero background = the team's primary colour**, text = the team's `text_on_primary`
  (NFL: add `primary_color` / `text_on_primary` to the NFL team table the same way `MLB_TEAMS` has them).
- Rank colours run green → grey → red by rank (`rankTone()` in `ui.tsx`): top ~5 dark green,
  top third light green, middle grey, bottom third light red, bottom ~5 red. **Rank = position among the clubs that have the number;
  missing data is `null` and an empty state, never a substitute.**
- Yellow is for the `PRO` badge and highlights on dark heroes.

## 3. Shape & layout

- **Rounded cards (14px) are used on team / player pages** — this is the documented
  exception to the old "zero border-radius" rule. New sport pages follow the team-page look.
- Page width `max-width: 1240px`, `24px` side padding.
- Section marker `§ 01` (mono, orange) before each section title; `⊕` before kickers.
- **Responsive layout uses a `<style>` block with plain CSS `@media`** (`.tp-grid-2`, `.tp-grid-3`,
  `.tp-tiles`, `.tp-tiles-2`, `.tp-cards`, breakpoint 900px). Tailwind responsive classes are
  unreliable under Turbopack.
- Sticky nav pills under the hero (`Season · Identity · …`) on the team page; a sticky **tab bar**
  (`ProfileTabs`) on the player page.

## 4. Building blocks (copy, don't rewrite)

| File | What it gives you |
|---|---|
| `src/components/team/ui.tsx` | `C`, `SANS`, `MONO`, `DISPLAY`, `Section`, `Card`, `Tile`, `RankBars`, `RankChip`, `VersusBars`, `StackedBar`, `Foot`, `Empty`, `rankTone`, headshot/logo URL helpers |
| `src/components/team/charts.tsx` | Recharts client charts: timeline, radar, donut, scatter (props are plain data — **never pass functions from a server component**) |
| `src/components/profile/ProPanel.tsx` | The Pro "expand" pattern (see §5) |
| `src/components/profile/ProfileTabs.tsx` | Tab bar with `PRO` badges; panels stay mounted |
| `src/lib/ordinal.ts` | Dependency-free `ordinal()` — client components must not import server-only modules |
| `src/lib/team-profile/league.ts` | `metric()` / `metricFromValues()`: one league table, one ranking helper, so a rank can never disagree with the number beside it |

## 5. Pro pattern

- **Free page first, Pro "expands" it.** Every section ends with one `ProPanel` that extends a concept already on the page.
- `isPro` is a **required prop and is never defaulted** (a default of `true` once leaked Pro to logged-out users).
- Locked state = a card with the feature list and an upgrade link — **no numbers, no blurred fake charts** (empty state over fabricated data).
- **Gate on the server.** For non-Pro, the Pro children must not be constructed and Pro data must not be fetched or shipped in the HTML/RSC payload. APIs use `requirePro()` (`src/lib/require-pro.ts`), route layouts use `isProViewer()`.
- Local dev unlocks Pro (`next dev` only); add `?pro=0` to a page (or cookie `edge_force_locked=1` for APIs/layouts) to preview the locked state.

## 6. Content rules (unchanged, non-negotiable)

- Not a betting/tips product: **"reads", "leans", "factors"** — no picks, locks, odds, value bets.
- The raw Edge Score never appears on a public surface; use factor counts ("X of 8 factors lean TEAM").
- Descriptions of what happened, with the sample behind them — not predictions. Footnote the source and method on every chart.
- Charts: **Recharts** only.

---

## 7. NFL checklist — apply this when building NFL pages

1. **Fonts:** Outfit for headers/bold/body, JetBrains Mono for light labels and footnotes. **No Bebas Neue, no Fraunces.** Import `SANS` / `MONO` / `DISPLAY` from `components/team/ui.tsx`; never write a literal family name.
2. **Reuse, don't fork:** start from `Section`, `Card`, `Tile`, `RankBars`, `ProPanel`, `ProfileTabs`. If `team/ui.tsx` is too MLB-named for you, move the shared pieces to a sport-neutral folder (e.g. `src/components/profile-ui/`) and re-export from `team/ui.tsx` — don't copy the file.
3. **Ranks are among 32 clubs**, not 30 — the helpers take `of` from the data; don't hard-code 30 in copy ("rank among 30" text, `maxRank = 30`).
4. **Same page shape:** team-coloured hero → sticky section nav → numbered `§` sections → Pro `ProPanel` at the end of each section → source/method footnote.
5. **Same data rule:** cron → Python → Supabase → page reads rows. League-wide rank tables from one cached call/table; nothing live-fanned-out in a render path.
6. **Same Pro rule:** server-side gate, required `isPro`, locked card with feature list only.
7. **NFL-specific gotchas still apply** (see `CLAUDE.md` §4): ESPN team-ID maps are corrupted (verify with curl), coverage names use underscores, participation→pbp join keys. Verify every external field against a live response before parsing.
8. **Verify visually** (headless Chrome screenshot) and check the browser console — the last redesign caught a hook-order bug and a server→client function-prop bug that `tsc` could not.
