// src/lib/front-office/signal.ts
//
// Signal Meter thresholds. They live in the `stat_stabilisation` table so they
// can be cited and edited without a deploy. No row for a metric = no meter
// (empty state over a guessed threshold).

import { createAdminClient } from '@/lib/supabase'

export type Stabilisation = { metricKey: string; label: string; threshold: number; unit: string; sourceUrl: string | null }
export type SignalState = 'early' | 'settling' | 'reliable'

export async function getStabilisation(): Promise<Record<string, Stabilisation>> {
  const { data, error } = await createAdminClient()
    .from('stat_stabilisation').select('metric_key, label, threshold, unit, source_url')
  if (error) {
    console.error('[getStabilisation] Supabase error:', error.message)
    return {}
  }
  const out: Record<string, Stabilisation> = {}
  for (const r of (data ?? []) as any[]) {
    // multi-season stats (BABIP, LOB%, HR/FB) carry a null threshold: no single-season number exists, so no meter.
    if (r.threshold == null) continue
    out[r.metric_key] = { metricKey: r.metric_key, label: r.label, threshold: Number(r.threshold), unit: r.unit, sourceUrl: r.source_url ?? null }
  }
  return out
}

/** Under half the threshold = early, under the threshold = settling, at/over = reliable. */
export function signalState(sample: number, threshold: number): SignalState {
  if (!(threshold > 0)) return 'early'
  const r = sample / threshold
  return r >= 1 ? 'reliable' : r >= 0.5 ? 'settling' : 'early'
}
