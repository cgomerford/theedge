// Tab names for the "Sign up to see X's ..." line (the old static mockups were replaced by the real tab on a sample player: DemoFrame).
export const LAB_NOUN: Record<'batting' | 'pitching', Record<string, string>> = {
  batting: { '': 'overview', arsenal: 'results against every pitch type', location: 'pitch locations', 'hot-zones': 'hot zones', sequencing: 'pitch sequencing', trends: 'trends', h2h: 'head-to-head record', swing: 'swing changes', contact: 'contact quality', outcomes: 'three true outcomes', platoon: 'platoon splits', approach: 'swing decisions', reaction: 'reaction window' },
  pitching: { '': 'overview', arsenal: 'arsenal', location: 'pitch locations', overlay: 'hot zone overlay', sequencing: 'pitch sequencing', shape: 'pitch shape', stuff: 'stuff', trends: 'trends', h2h: 'head-to-head record' },
}

export function tabOf(path: string | null): string {
  const last = (path ?? '').replace(/\/$/, '').split('/').pop() ?? ''
  return /^\d+$/.test(last) ? '' : last   // the Overview URL ends in the player id
}
