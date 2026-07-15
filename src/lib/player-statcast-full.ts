// src/lib/player-statcast-full.ts
//
// Extended Savant fetchers. Pulls the RAW-value leaderboards (not just the
// 0-100 percentile-rankings endpoint) so we can display actual xwOBA .391,
// avg EV 91.2, etc. — plus the percentile ranks alongside for the dials.
//
// Endpoints used (all confirmed working via CSV, no auth):
//   - expected_statistics       → xBA, xSLG, xwOBA, xISO, xBABIP
//   - statcast (batted-ball)    → barrel%, hard-hit%, sweet-spot%, EV, LA
//   - sprint_speed              → sprint_speed, bolts
//   - percentile-rankings       → 0-100 ranks, per metric
//   - pitch-arsenal-stats       → per-pitch usage, velo, whiff, xwOBA
//   - swing_take                → chase%, meatball swing%
//   - outs_above_average        → OAA + directional (already handled elsewhere)
//
// CSV parsing uses a quote-aware splitter — Savant fields contain commas
// inside quoted "last, first" name cells that would misalign a naive split.

const SEASON = new Date().getFullYear()
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'

// ─── Quote-aware CSV parser ───────────────────────────────────────────────

function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') { inQuotes = !inQuotes; continue }
    if (c === ',' && !inQuotes) { out.push(cur.trim()); cur = ''; continue }
    cur += c
  }
  out.push(cur.trim())
  return out
}

async function fetchCsv(url: string): Promise<{ headers: string[]; rows: string[][] } | null> {
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: { 'User-Agent': UA, Accept: 'text/csv,*/*' },
    })
    if (!res.ok) return null
    const text = await res.text()
    const lines = text.trim().split('\n')
    if (lines.length < 2) return null
    const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase())
    const rows = lines.slice(1).map(parseCsvLine)
    return { headers, rows }
  } catch (err) {
    console.error('[fetchCsv]', url, err)
    return null
  }
}

function findRowByPlayerId(
  csv: { headers: string[]; rows: string[][] },
  playerId: number,
): string[] | null {
  const idIdx = csv.headers.findIndex(h =>
    h === 'player_id' || h === 'playerid' || h === 'mlbam_id' || h === 'batter_id' || h === 'pitcher_id'
  )
  if (idIdx === -1) return null
  const target = String(playerId)
  for (const row of csv.rows) {
    if (row[idIdx] === target) return row
  }
  return null
}

function num(row: string[], headers: string[], key: string): number | null {
  const idx = headers.indexOf(key)
  if (idx === -1) return null
  const v = parseFloat(row[idx])
  return isNaN(v) ? null : v
}

// ─── Batter full stat block ──────────────────────────────────────────────

export interface BatterStatcastFull {
  // Expected
  xba: number | null
  xslg: number | null
  xwoba: number | null
  xiso: number | null
  xbabip: number | null
  xwobacon: number | null
  // Contact quality
  avg_exit_velocity: number | null
  max_exit_velocity: number | null
  hard_hit_pct: number | null
  barrel_pct: number | null
  barrel_per_bbe: number | null
  sweet_spot_pct: number | null
  avg_launch_angle: number | null
  // Batted-ball
  gb_pct: number | null
  fb_pct: number | null
  ld_pct: number | null
  popup_pct: number | null
  pull_pct: number | null
  straight_pct: number | null
  oppo_pct: number | null
  // Plate discipline
  chase_pct: number | null
  whiff_pct: number | null
  zone_contact_pct: number | null
  oz_contact_pct: number | null
  // Speed
  sprint_speed: number | null
  bolts: number | null
  // Ranks (0-100)
  ranks: {
    xwoba: number | null
    xba: number | null
    xslg: number | null
    barrel_pct: number | null
    hard_hit_pct: number | null
    chase_pct: number | null
    whiff_pct: number | null
    sprint_speed: number | null
    exit_velocity: number | null
    k_pct: number | null
    bb_pct: number | null
  }
}

const EMPTY_BATTER: BatterStatcastFull = {
  xba: null, xslg: null, xwoba: null, xiso: null, xbabip: null, xwobacon: null,
  avg_exit_velocity: null, max_exit_velocity: null, hard_hit_pct: null,
  barrel_pct: null, barrel_per_bbe: null, sweet_spot_pct: null, avg_launch_angle: null,
  gb_pct: null, fb_pct: null, ld_pct: null, popup_pct: null,
  pull_pct: null, straight_pct: null, oppo_pct: null,
  chase_pct: null, whiff_pct: null, zone_contact_pct: null, oz_contact_pct: null,
  sprint_speed: null, bolts: null,
  ranks: {
    xwoba: null, xba: null, xslg: null, barrel_pct: null, hard_hit_pct: null,
    chase_pct: null, whiff_pct: null, sprint_speed: null, exit_velocity: null,
    k_pct: null, bb_pct: null,
  },
}

export async function getBatterStatcastFull(playerId: number, season = SEASON): Promise<BatterStatcastFull> {
  const [custom, statcast, sprint, ranks] = await Promise.all([
    fetchCsv(
      `https://baseballsavant.mlb.com/leaderboard/custom?year=${season}&type=batter&filter=&min=1` +
      `&selections=xba,xslg,xwoba,xbabip,k_percent,bb_percent,whiff_percent,chase_percent,` +
      `groundballs_percent,flyballs_percent,linedrives_percent,popups_percent,` +
      `pull_percent,straightaway_percent,opposite_percent` +
      `&chart=false&sort=xwoba&sortDir=desc&csv=true`
    ),
    fetchCsv(`https://baseballsavant.mlb.com/leaderboard/statcast?type=batter&year=${season}&min=1&csv=true`),
    fetchCsv(`https://baseballsavant.mlb.com/sprint_speed_leaderboard?season=${season}&position=&team=&min=10&csv=true`),
    fetchCsv(`https://baseballsavant.mlb.com/leaderboard/percentile-rankings?type=batter&year=${season}&csv=true`),
  ])

  const out: BatterStatcastFull = { ...EMPTY_BATTER, ranks: { ...EMPTY_BATTER.ranks } }

if (custom) {
  const row = findRowByPlayerId(custom, playerId)
  if (row) {
    out.xba = num(row, custom.headers, 'xba')
    out.xslg = num(row, custom.headers, 'xslg')
    out.xwoba = num(row, custom.headers, 'xwoba')
    out.xbabip = num(row, custom.headers, 'xbabip')
    if (out.xslg != null && out.xba != null) out.xiso = out.xslg - out.xba
    out.whiff_pct = num(row, custom.headers, 'whiff_percent')
    out.oz_contact_pct = num(row, custom.headers, 'oz_contact_percent')
    // chase_pct and zone_contact_pct: no working Savant field found — leave null, show '—' honestly
    out.gb_pct = num(row, custom.headers, 'groundballs_percent')
    out.fb_pct = num(row, custom.headers, 'flyballs_percent')
    out.ld_pct = num(row, custom.headers, 'linedrives_percent')
    out.popup_pct = num(row, custom.headers, 'popups_percent')
    out.pull_pct = num(row, custom.headers, 'pull_percent')
    out.straight_pct = num(row, custom.headers, 'straightaway_percent')
    out.oppo_pct = num(row, custom.headers, 'opposite_percent')
  }
}

  // EV/barrel/sweet-spot still come from the statcast leaderboard — confirmed working
  if (statcast) {
    const row = findRowByPlayerId(statcast, playerId)
    if (row) {
      out.avg_exit_velocity = num(row, statcast.headers, 'avg_hit_speed')
      out.max_exit_velocity = num(row, statcast.headers, 'max_hit_speed')
      out.hard_hit_pct = num(row, statcast.headers, 'ev95percent')
      out.barrel_pct = num(row, statcast.headers, 'brl_percent')
      out.barrel_per_bbe = num(row, statcast.headers, 'brl_pa')
      out.sweet_spot_pct = num(row, statcast.headers, 'anglesweetspotpercent')
      out.avg_launch_angle = num(row, statcast.headers, 'avg_hit_angle')
    }
  }

  if (sprint) {
    const row = findRowByPlayerId(sprint, playerId)
    if (row) {
      out.sprint_speed = num(row, sprint.headers, 'sprint_speed')
      out.bolts = num(row, sprint.headers, 'bolts')
    }
  }

  if (ranks) {
    const row = findRowByPlayerId(ranks, playerId)
    if (row) {
      out.ranks.xwoba = num(row, ranks.headers, 'xwoba')
      out.ranks.xba = num(row, ranks.headers, 'xba')
      out.ranks.xslg = num(row, ranks.headers, 'xslg')
      out.ranks.barrel_pct = num(row, ranks.headers, 'brl_percent') ?? num(row, ranks.headers, 'brl_pa')
      out.ranks.hard_hit_pct = num(row, ranks.headers, 'hard_hit_percent')
      out.ranks.chase_pct = num(row, ranks.headers, 'oz_swing_percent') ?? num(row, ranks.headers, 'chase_percent')
      out.ranks.whiff_pct = num(row, ranks.headers, 'whiff_percent')
      out.ranks.sprint_speed = num(row, ranks.headers, 'sprint_speed')
      out.ranks.exit_velocity = num(row, ranks.headers, 'exit_velocity_avg') ?? num(row, ranks.headers, 'avg_hit_speed')
      out.ranks.k_pct = num(row, ranks.headers, 'k_percent')
      out.ranks.bb_pct = num(row, ranks.headers, 'bb_percent')
    }
  }

  return out
}

// ─── Pitcher arsenal + full block ─────────────────────────────────────────

export interface PitchInArsenal {
  pitch_type: string
  pitch_name: string
  usage_pct: number | null
  velocity: number | null
  spin_rate: number | null
  vertical_break: number | null
  horizontal_break: number | null
  whiff_pct: number | null
  put_away_pct: number | null
  xwoba: number | null
  run_value_per_100: number | null
}

export interface PitcherStatcastFull {
  xera: number | null
  xba: number | null
  xslg: number | null
  xwoba: number | null
  avg_fastball_velo: number | null
  whiff_pct: number | null
  chase_pct: number | null
  k_pct: number | null
  bb_pct: number | null
  k_bb_pct: number | null
  barrel_pct_allowed: number | null
  hard_hit_pct_allowed: number | null
  gb_pct: number | null
  fb_pct: number | null
  arsenal: PitchInArsenal[]
  ranks: {
    xera: number | null
    xba: number | null
    xslg: number | null
    xwoba: number | null
    fastball_velo: number | null
    whiff_pct: number | null
    chase_pct: number | null
    k_pct: number | null
    bb_pct: number | null
    barrel_pct: number | null
    hard_hit_pct: number | null
    gb_pct: number | null
    extension: number | null
  }
}

const EMPTY_PITCHER: PitcherStatcastFull = {
  xera: null, xba: null, xslg: null, xwoba: null,
  avg_fastball_velo: null, whiff_pct: null, chase_pct: null,
  k_pct: null, bb_pct: null, k_bb_pct: null,
  barrel_pct_allowed: null, hard_hit_pct_allowed: null,
  gb_pct: null, fb_pct: null,
  arsenal: [],
  ranks: {
    xera: null, xba: null, xslg: null, xwoba: null,
    fastball_velo: null, whiff_pct: null, chase_pct: null,
    k_pct: null, bb_pct: null, barrel_pct: null,
    hard_hit_pct: null, gb_pct: null, extension: null,
  },
}
export async function getPitcherStatcastFull(playerId: number, season = SEASON): Promise<PitcherStatcastFull> {
  const [custom, statcast, arsenal, ranks] = await Promise.all([
    fetchCsv(
      `https://baseballsavant.mlb.com/leaderboard/custom?year=${season}&type=pitcher&filter=&min=1` +
      `&selections=xera,xba,xslg,xwoba,k_percent,bb_percent,whiff_percent,` +
      `groundballs_percent,flyballs_percent,hard_hit_percent,fastball_avg_speed` +
      `&chart=false&sort=xera&sortDir=asc&csv=true`
    ),
    fetchCsv(`https://baseballsavant.mlb.com/leaderboard/statcast?type=pitcher&year=${season}&min=1&csv=true`),
    fetchCsv(`https://baseballsavant.mlb.com/leaderboard/pitch-arsenal-stats?type=pitcher&pitchType=&year=${season}&min=10&csv=true`),
    fetchCsv(`https://baseballsavant.mlb.com/leaderboard/percentile-rankings?type=pitcher&year=${season}&csv=true`),
  ])

  const out: PitcherStatcastFull = { ...EMPTY_PITCHER, arsenal: [], ranks: { ...EMPTY_PITCHER.ranks } }

  // Confirmed working fields — verified via curl 2026-07-15.
  // chase_percent and barrel_percent are BOTH dead on this leaderboard for
  // pitchers (blank for every row tested, not a sample-size issue) — same
  // as the batter side. Not requested, not mapped. Show '—' honestly.
  if (custom) {
    const row = findRowByPlayerId(custom, playerId)
    if (row) {
      out.xera = num(row, custom.headers, 'xera')
      out.xba = num(row, custom.headers, 'xba')
      out.xslg = num(row, custom.headers, 'xslg')
      out.xwoba = num(row, custom.headers, 'xwoba')
      out.k_pct = num(row, custom.headers, 'k_percent')
      out.bb_pct = num(row, custom.headers, 'bb_percent')
      if (out.k_pct != null && out.bb_pct != null) out.k_bb_pct = out.k_pct - out.bb_pct
      out.whiff_pct = num(row, custom.headers, 'whiff_percent')
      out.gb_pct = num(row, custom.headers, 'groundballs_percent')
      out.fb_pct = num(row, custom.headers, 'flyballs_percent')
      out.hard_hit_pct_allowed = num(row, custom.headers, 'hard_hit_percent')
      out.avg_fastball_velo = num(row, custom.headers, 'fastball_avg_speed')
    }
  }

  // barrel_pct_allowed: UNCONFIRMED source. The 'statcast' leaderboard's
  // brl_percent column is verified working for batters but not
  // independently tested here for pitcher rows — flagging honestly rather
  // than presenting it as equally solid.
  if (statcast) {
    const row = findRowByPlayerId(statcast, playerId)
    if (row) {
      out.barrel_pct_allowed = num(row, statcast.headers, 'brl_percent')
    }
  }

  if (arsenal) {
    const target = String(playerId)
    const idIdx = arsenal.headers.findIndex(h => h === 'player_id')
    for (const row of arsenal.rows) {
      if (row[idIdx] !== target) continue
      out.arsenal.push({
        pitch_type: row[arsenal.headers.indexOf('pitch_type')] ?? '',
        pitch_name: row[arsenal.headers.indexOf('pitch_name')] ?? '',
        usage_pct: num(row, arsenal.headers, 'pitch_usage'),
        whiff_pct: num(row, arsenal.headers, 'whiff_percent'),
        put_away_pct: num(row, arsenal.headers, 'put_away'),
        k_pct: num(row, arsenal.headers, 'k_percent'),
        ba_against: num(row, arsenal.headers, 'ba'),
        slg_against: num(row, arsenal.headers, 'slg'),
        woba_against: num(row, arsenal.headers, 'woba'),
        xba_against: num(row, arsenal.headers, 'est_ba'),
        xslg_against: num(row, arsenal.headers, 'est_slg'),
        xwoba: num(row, arsenal.headers, 'est_woba'),
        hard_hit_pct: num(row, arsenal.headers, 'hard_hit_percent'),
        run_value_per_100: num(row, arsenal.headers, 'run_value_per_100'),
      })
    }
    out.arsenal.sort((a, b) => (b.usage_pct ?? 0) - (a.usage_pct ?? 0))
  }

  if (ranks) {
    const row = findRowByPlayerId(ranks, playerId)
    if (row) {
      out.ranks.xera = num(row, ranks.headers, 'xera')
      out.ranks.xba = num(row, ranks.headers, 'xba')
      out.ranks.xslg = num(row, ranks.headers, 'xslg')
      out.ranks.xwoba = num(row, ranks.headers, 'xwoba')
      out.ranks.fastball_velo = num(row, ranks.headers, 'fastball_avg_speed')
      out.ranks.whiff_pct = num(row, ranks.headers, 'whiff_percent')
      out.ranks.k_pct = num(row, ranks.headers, 'k_percent')
      out.ranks.bb_pct = num(row, ranks.headers, 'bb_percent')
      out.ranks.hard_hit_pct = num(row, ranks.headers, 'hard_hit_percent')
      out.ranks.gb_pct = num(row, ranks.headers, 'gb_percent')
      // chase_pct rank + extension: not requested here, no confirmed field
    }
  }

  return out
}