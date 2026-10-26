// A 36px context strip under the MLB tabs (scout report breadcrumb, Pitching Lab pitcher line). Single line, overflow hidden.
import type { ReactNode } from 'react'

export default function ContextStrip({ left, right }: { left: ReactNode; right?: ReactNode }) {
  return (
    <div className="x9-strip-bg"><div className="x9-strip">
      <style>{`
        .x9-strip-bg{background:#F0ECE1;border-bottom:1px solid #E8E4DC}.x9-strip{display:flex;align-items:center;gap:14px;height:36px;padding:0 24px;max-width:1360px;margin:0 auto;font-size:13px;color:#57534E;font-variant-numeric:tabular-nums;overflow:hidden;white-space:nowrap}
        .x9-strip b{color:#1A1A1A}
        .x9-strip-l{display:flex;align-items:center;gap:8px;min-width:0;overflow:hidden;text-overflow:ellipsis}
        .x9-strip-r{margin-left:auto;display:flex;align-items:center;gap:10px;color:#8A8577;flex-shrink:0}
        .x9-strip-r a{color:#57534E}
        .x9-strip-d{display:inline}.x9-strip-m{display:none}
        @media (max-width:767px){.x9-strip-d{display:none}.x9-strip-m{display:inline}}
      `}</style>
      <div className="x9-strip-l">{left}</div>
      {right ? <div className="x9-strip-r">{right}</div> : null}
    </div></div>
  )
}
