// Bridges article.team_tags (codes like 'NYY') to both:
//   1. the slug format used in the header/mlb-homepage (e.g. 'yankees')
//   2. the numeric MLB team ID getMLBTeamLeaders needs
//
// The ID values are copied from MLB_TEAM_IDS in SiteHeader.tsx, which isn't
// exported there — this is the single exported source other files should use.

export const TEAM_CODE_TO_SLUG: Record<string, string> = {
  ARI: 'diamondbacks', ATL: 'braves',    BAL: 'orioles',    BOS: 'red-sox',
  CHC: 'cubs',          CHW: 'white-sox', CIN: 'reds',       CLE: 'guardians',
  COL: 'rockies',       DET: 'tigers',    HOU: 'astros',     KC: 'royals',
  LAA: 'angels',        LAD: 'dodgers',   MIA: 'marlins',    MIL: 'brewers',
  MIN: 'twins',         NYM: 'mets',      NYY: 'yankees',    OAK: 'athletics',
  PHI: 'phillies',      PIT: 'pirates',   SD: 'padres',      SEA: 'mariners',
  SF: 'giants',         STL: 'cardinals', TB: 'rays',        TEX: 'rangers',
  TOR: 'blue-jays',     WSH: 'nationals',
};

export const MLB_TEAM_IDS: Record<string, number> = {
  'yankees': 147, 'red-sox': 111, 'blue-jays': 141, 'orioles': 110, 'rays': 139,
  'guardians': 114, 'tigers': 116, 'royals': 118, 'twins': 142, 'white-sox': 145,
  'astros': 117, 'angels': 108, 'athletics': 133, 'mariners': 136, 'rangers': 140,
  'braves': 144, 'marlins': 146, 'mets': 121, 'phillies': 143, 'nationals': 120,
  'cubs': 112, 'reds': 113, 'brewers': 158, 'pirates': 134, 'cardinals': 138,
  'diamondbacks': 109, 'rockies': 115, 'dodgers': 119, 'padres': 135, 'giants': 137,
};

export function teamCodeToId(code: string): number | undefined {
  const slug = TEAM_CODE_TO_SLUG[code];
  return slug ? MLB_TEAM_IDS[slug] : undefined;
}

export function teamCodeToName(code: string): string {
  const slug = TEAM_CODE_TO_SLUG[code];
  if (!slug) return code;
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}