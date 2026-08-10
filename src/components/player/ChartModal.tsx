'use client'

// src/components/player/ChartModal.tsx
//
// Shared full-size expand modal for chart cards (Season Progression,
// Radar). No external images inside these charts (pure recharts SVG +
// text), so unlike the share card, no CORS proxy is needed here — a
// direct toPng() capture works fine.

import { AnimatePresence, motion } from 'framer-motion'

export default function ChartModal({
  open, onClose, title, children, onDownload, downloading,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  onDownload?: () => void
  downloading?: boolean
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.2 }}
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-xl w-full max-w-3xl max-h-[85vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100 sticky top-0 bg-white z-10">
              <p className="font-mono text-[11px] uppercase tracking-widest text-stone-600 font-bold">{title}</p>
              <div className="flex items-center gap-3">
                {onDownload && (
                  <button
                    onClick={onDownload}
                    disabled={downloading}
                    className="font-mono text-[9px] uppercase tracking-widest bg-[#1A1A1A] text-white px-3 py-1.5 rounded-lg hover:bg-[#FF5722] transition disabled:opacity-50"
                  >
                    {downloading ? 'Generating…' : 'Download PNG'}
                  </button>
                )}
                <button onClick={onClose} className="text-stone-400 hover:text-stone-800 text-lg leading-none">✕</button>
              </div>
            </div>
            <div className="p-5">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}