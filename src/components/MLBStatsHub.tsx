'use client'

/**
 * src/components/MLBStatsHub.tsx
 *
 * Route: /mlb/stats
 * A clean stats hub — users get sensible default columns and can add more.
 * Data comes from statLeaders (already fetched on the MLB homepage server component).
 * No new fetching needed if you pass the same prop down.
 *
 * Tabs: Pitching · Batting
 * Each tab: sortable table with 4 default columns + column picker for extras.
 */

import { useState, useMemo } from 'react'
import type { MLBStatLeader } from '@/lib/mlb-homepage'

// ─── Column definitions ───────────────────────────────────────────────────────

type ColDef = {
  key: string        // maps to statLeaders[key]
  label: string      // display header
  short: string      // short label for mobile
  desc: string       // tooltip / description shown in picker
  default: boolean   // shown by default
  group: 'pitching' | 'batting'
  format?: (v: string) => string
}

const COLUMNS: ColDef[] = [
  // ── Pitching ──
  { key: 'strikeouts',   label: 'Strikeouts',  short: 'K',    desc: 'Total strikeouts this season',               default: true,  group: 'pitching' },
  { key: 'era',          label: 'ERA',         short: 'ERA',  desc: 'Earned run average — runs per 9 innings',    default: true,  group: 'pitching' },
  { key: 'wins',         label: 'Wins',        short: 'W',    desc: 'Pitcher wins this season',                   default: true,  group: 'pitching' },
  { key: 'whip',         label: 'WHIP',        short: 'WHIP', desc: 'Walks + hits per inning pitched',            default: true,  group: 'pitching' },
  { key: 'inningsPitched', label: 'Innings',   short: 'IP',   desc: 'Total innings pitched this season',         default: false, group: 'pitching' },
  { key: 'saves',        label: 'Saves',       short: 'SV',   desc: 'Saves recorded this season',                default: false, group: 'pitching' },
  { key: 'strikeoutsPer9Inn', label: 'K/9',   short: 'K/9',  desc: 'Strikeouts per 9 innings — measures swing-and-miss rate', default: false, group: 'pitching' },
  { key: 'walksAndHitsPerInningPitched', label: 'WHIP', short: 'WHIP', desc: 'Walks + hits per inning pitched', default: false, group: 'pitching' },

  // ── Batting ──
  { key: 'battingAverage', label: 'AVG',       short: 'AVG',  desc: 'Batting average — hits per at-bat',         default: true,  group: 'batting' },
  { key: 'homeRuns',     label: 'HR',          short: 'HR',   desc: 'Home runs hit this season',                 default: true,  group: 'batting' },
  { key: 'rbi',          label: 'RBI',         short: 'RBI',  desc: 'Runs batted in this season',                default: true,  group: 'batting' },
  { key: 'onBasePlusSlugging', label: 'OPS',   short: 'OPS',  desc: 'On-base % + slugging % — best single hitting metric', default: true, group: 'batting' },
  { key: 'stolenBases',  label: 'SB',          short: 'SB',   desc: 'Stolen bases this season',                  default: false, group: 'batting' },
  { key: 'runs',         label: 'Runs',        short: 'R',    desc: 'Runs scored this season',                   default: false, group: 'batting' },
  { key: 'hits',         label: 'Hits',        short: 'H',    desc: 'Total hits this season',                    default: false, group: 'batting' },
  { key: 'onBasePercentage', label: 'OBP',     short: 'OBP', desc: 'On-base % — how often a batter reaches base', default: false, group: 'batting' },
  { key: 'sluggingPercentage', label: 'SLG',   short: 'SLG', desc: 'Slugging % — total bases per at-bat',       default: false, group: 'batting' },
]

type Props = {
  statLeaders: Record<string, MLBStatLeader[]>
}

function playerHeadshotUrl(id: number): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${id}/headshot/67/current`
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MLBStatsHub({ statLeaders }: Props) {
  const [activeTab, setActiveTab] = useState<'pitching' | 'batting'>('pitching')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [enabledCols, setEnabledCols] = useState<Set<string>>(() => {
    const defaults = COLUMNS.filter(c => c.default).map(c => c.key)
    return new Set(defaults)
  })
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const tabCols = COLUMNS.filter(c => c.group === activeTab)
  const activeCols = tabCols.filter(c => enabledCols.has(c.key))

  function toggleCol(key: string) {
    setEnabledCols(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        // Don't remove if it's the last active col in this tab
        const activeInTab = tabCols.filter(c => next.has(c.key))
        if (activeInTab.length <= 1) return prev
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  function handleSort(key: string) {
    if (sortCol === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(key)
      setSortDir('desc')
    }
  }

  // Build rows — one row per player, pulling their stat value from each leader list
  const playerMap = useMemo(() => {
    const map = new Map<number, { id: number; name: string; teamAbbr: string; headshot: string; stats: Record<string, string> }>()

    activeCols.forEach(col => {
      const leaders = statLeaders[col.key] ?? []
      leaders.forEach(l => {
        if (!map.has(l.personId)) {
          map.set(l.personId, { id: l.personId, name: l.name, teamAbbr: l.teamAbbr, headshot: l.headshot, stats: {} })
        }
        map.get(l.personId)!.stats[col.key] = l.statValue
      })
    })

    return map
  }, [activeCols, statLeaders])

  // Use the first active col's leader list as the primary ordering
  const primaryKey = sortCol ?? activeCols[0]?.key
  const primaryLeaders = statLeaders[primaryKey] ?? []

  // Only show players who appear in the primary leader list
  const rows = primaryLeaders
    .map(l => ({
      ...l,
      extraStats: playerMap.get(l.personId)?.stats ?? {},
    }))
    .slice(0, 25)

  // Sort override if user clicked a secondary column
  const sortedRows = sortCol && sortCol !== primaryKey
    ? [...rows].sort((a, b) => {
        const av = parseFloat(a.extraStats[sortCol] ?? '0')
        const bv = parseFloat(b.extraStats[sortCol] ?? '0')
        return sortDir === 'desc' ? bv - av : av - bv
      })
    : rows

  return (
    <div style={{ background: '#FAF8F3', minHeight: '100vh' }}>

      <style>{`
        .stats-table { width: 100%; border-collapse: collapse; }
        .stats-table th, .stats-table td {
          padding: 10px 12px;
          border-bottom: 1px solid rgba(26,26,26,0.05);
          text-align: right;
        }
        .stats-table th:first-child,
        .stats-table td:first-child { text-align: left; }
        .stats-table tbody tr:hover { background: rgba(255,87,34,0.03); }
        .stats-table thead th {
          background: #F5F1E8;
          border-bottom: 2px solid rgba(26,26,26,0.1);
          cursor: pointer;
          user-select: none;
        }
        .stats-table thead th:hover { color: #FF5722; }
        .col-pill {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 5px 10px; border-radius: 3px; cursor: pointer;
          border: 1px solid rgba(26,26,26,0.12);
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px; font-weight: 700;
          transition: all 0.12s;
          white-space: nowrap;
        }
        .col-pill.active {
          background: #1A1A1A; color: #FAF8F3; border-color: #1A1A1A;
        }
        .col-pill.inactive {
          background: #FFFFFF; color: #A3A3A3;
        }
        .col-pill.inactive:hover { border-color: #FF5722; color: #FF5722; }
      `}</style>

      {/* Header */}
      <div style={{
        borderBottom: '1px solid rgba(26,26,26,0.08)',
        padding: '20px 24px 16px',
        maxWidth: 1160, margin: '0 auto',
      }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10, fontWeight: 700, color: '#FF5722',
          letterSpacing: '0.1em', marginBottom: 4,
        }}>
          § MLB · LEAGUE LEADERS
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <h1 style={{
            fontFamily: "'Fraunces', serif",
            fontSize: 26, fontWeight: 800, color: '#1A1A1A',
            margin: 0, letterSpacing: '-0.5px',
          }}>
            Stats Hub
          </h1>
          <a href="/mlb" style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10, fontWeight: 700, color: '#A3A3A3',
            textDecoration: 'none', letterSpacing: '0.06em',
          }}>
            ← Today's games
          </a>
        </div>
      </div>

      <div style={{ maxWidth: 1160, margin: '0 auto', padding: '24px 24px 48px' }}>

        {/* Tab bar + column picker */}
        <div style={{
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
          marginBottom: 16,
        }}>

          {/* Tabs */}
          <div style={{ display: 'flex', background: 'rgba(26,26,26,0.06)', borderRadius: 3, padding: 3 }}>
            {(['pitching', 'batting'] as const).map(tab => (
              <button key={tab} onClick={() => { setActiveTab(tab); setSortCol(null) }} style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11, fontWeight: 700, padding: '6px 20px',
                border: 'none', cursor: 'pointer', borderRadius: 2,
                letterSpacing: '0.06em', textTransform: 'capitalize',
                background: activeTab === tab ? '#1A1A1A' : 'transparent',
                color: activeTab === tab ? '#FAF8F3' : '#A3A3A3',
                transition: 'all 0.12s',
              }}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {/* Column picker toggle */}
          <button
            onClick={() => setPickerOpen(o => !o)}
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11, fontWeight: 700, padding: '6px 14px',
              border: '1px solid rgba(26,26,26,0.15)',
              background: pickerOpen ? '#1A1A1A' : '#FFFFFF',
              color: pickerOpen ? '#FAF8F3' : '#A3A3A3',
              borderRadius: 3, cursor: 'pointer',
              letterSpacing: '0.06em',
            }}
          >
            + Columns
          </button>
        </div>

        {/* Column picker panel */}
        {pickerOpen && (
          <div style={{
            background: '#FFFFFF',
            border: '1px solid rgba(26,26,26,0.1)',
            padding: '14px 16px',
            marginBottom: 16,
          }}>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 9, fontWeight: 700, color: '#A3A3A3',
              letterSpacing: '0.1em', textTransform: 'uppercase',
              marginBottom: 10,
            }}>
              {activeTab === 'pitching' ? 'Pitching' : 'Batting'} columns
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {tabCols.map(col => {
                const isActive = enabledCols.has(col.key)
                return (
                  <button
                    key={col.key}
                    onClick={() => toggleCol(col.key)}
                    className={`col-pill ${isActive ? 'active' : 'inactive'}`}
                    title={col.desc}
                  >
                    {col.label}
                    {isActive && (
                      <span style={{ opacity: 0.6, fontSize: 9 }}>✕</span>
                    )}
                  </button>
                )
              })}
            </div>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 9, color: '#A3A3A3', marginTop: 8,
            }}>
              Hover any column header to see a description. Click to sort.
            </div>
          </div>
        )}

        {/* Table */}
        <div style={{
          background: '#FFFFFF',
          border: '1px solid rgba(26,26,26,0.08)',
          overflowX: 'auto',
        }}>
          <table className="stats-table">
            <thead>
              <tr>
                <th style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 9, fontWeight: 700, color: '#A3A3A3',
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  padding: '10px 12px',
                  textAlign: 'left',
                }}>
                  #&nbsp;&nbsp;Player
                </th>
                {activeCols.map(col => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    title={col.desc}
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 9, fontWeight: 700,
                      color: sortCol === col.key ? '#FF5722' : '#A3A3A3',
                      letterSpacing: '0.08em', textTransform: 'uppercase',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {col.short}
                    {sortCol === col.key && (
                      <span style={{ marginLeft: 3 }}>{sortDir === 'desc' ? '↓' : '↑'}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((player, idx) => (
                <tr key={player.personId}>
                  {/* Rank + player */}
                  <td style={{ padding: '9px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 11, color: idx === 0 ? '#FF5722' : '#A3A3A3',
                        fontWeight: idx === 0 ? 700 : 400,
                        width: 18, flexShrink: 0, textAlign: 'right',
                      }}>
                        {idx + 1}
                      </span>
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%',
                        overflow: 'hidden', flexShrink: 0,
                        background: '#F5F1E8',
                      }}>
                        <img
                          src={player.headshot || playerHeadshotUrl(player.personId)}
                          alt={player.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                      </div>
                      <div>
                        <div style={{
                          fontFamily: "'Fraunces', serif",
                          fontSize: 13, fontWeight: idx < 3 ? 700 : 500,
                          color: '#1A1A1A', whiteSpace: 'nowrap',
                        }}>
                          {player.name}
                        </div>
                        <div style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 9, color: '#A3A3A3', letterSpacing: '0.04em',
                        }}>
                          {player.teamAbbr}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Stat cells */}
                  {activeCols.map((col, cIdx) => {
                    // Primary column value comes from the leader list directly
                    const val = cIdx === 0 && sortCol === null
                      ? player.statValue
                      : (player.extraStats[col.key] ?? '—')
                    const isTopThree = idx < 3 && (sortCol === col.key || (sortCol === null && cIdx === 0))
                    return (
                      <td key={col.key} style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 13, fontWeight: isTopThree ? 700 : 400,
                        color: isTopThree ? '#1A1A1A' : '#3D3D3D',
                        padding: '9px 12px',
                      }}>
                        {val}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer note */}
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 9, color: '#A3A3A3', marginTop: 10,
          letterSpacing: '0.04em',
        }}>
          Data via MLB Stats API. Hover column headers for descriptions. Click to sort.
        </div>
      </div>
    </div>
  )
}