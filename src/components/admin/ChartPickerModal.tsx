// components/admin/ChartPickerModal.tsx
'use client';

import { useState, useRef } from 'react';
import { toPng } from 'html-to-image';

// TODO — replace with your real components once confirmed:
// import PitchingArsenalChart from '@/components/game/PitchingArsenalChart';
// import OverlayChart from '@/components/admin/OverlayChart';

type ChartType = 'pitching_arsenal' | 'overlay_builder';

interface ChartPickerModalProps {
  onInsert: (url: string) => void;
  onClose: () => void;
}

export default function ChartPickerModal({ onInsert, onClose }: ChartPickerModalProps) {
  const [chartType, setChartType] = useState<ChartType>('pitching_arsenal');
  const [playerId, setPlayerId] = useState('');
  const [statA, setStatA] = useState('OPS');
  const [statB, setStatB] = useState('SLG');
  const [gameStart, setGameStart] = useState(1);
  const [gameEnd, setGameEnd] = useState(10);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState('');

  const captureRef = useRef<HTMLDivElement>(null);

  async function handleCapture() {
    if (!captureRef.current) return;
    setCapturing(true);
    setError('');

    try {
      // Small delay so the chart component finishes its own mount/animation
      // before the snapshot is taken — avoids capturing a half-drawn chart.
      await new Promise((r) => setTimeout(r, 400));

      const dataUrl = await toPng(captureRef.current, {
        pixelRatio: 2, // retina-quality snapshot for the article page
        backgroundColor: '#FAF8F3',
      });

      const blob = await (await fetch(dataUrl)).blob();
      const formData = new FormData();
      formData.append('file', blob, 'chart.png');

      const res = await fetch('/api/admin/upload', { method: 'POST', body: formData });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Upload failed');
      }

      const { url } = await res.json();
      onInsert(url);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Capture failed');
    } finally {
      setCapturing(false);
    }
  }

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18 }}>
          <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: 20 }}>⊕ Insert chart</h2>
          <button onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Chart type</label>
          <select
            value={chartType}
            onChange={(e) => setChartType(e.target.value as ChartType)}
            style={inputStyle}
          >
            <option value="pitching_arsenal">Pitching arsenal</option>
            <option value="overlay_builder">Stat overlay</option>
          </select>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Player ID</label>
          <input
            type="text"
            value={playerId}
            onChange={(e) => setPlayerId(e.target.value)}
            placeholder="e.g. 592450"
            style={inputStyle}
          />
        </div>

        {chartType === 'overlay_builder' && (
          <>
            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Stat A</label>
                <input value={statA} onChange={(e) => setStatA(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Stat B</label>
                <input value={statB} onChange={(e) => setStatB(e.target.value)} style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Game start</label>
                <input
                  type="number"
                  value={gameStart}
                  onChange={(e) => setGameStart(Number(e.target.value))}
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Game end</label>
                <input
                  type="number"
                  value={gameEnd}
                  onChange={(e) => setGameEnd(Number(e.target.value))}
                  style={inputStyle}
                />
              </div>
            </div>
          </>
        )}

        {/* Off-screen capture stage — rendered but visually hidden until captured.
            Positioned off-canvas rather than display:none, since html-to-image
            can't capture elements that aren't actually laid out. */}
        <div style={{ position: 'absolute', left: -9999, top: 0 }}>
          <div ref={captureRef} style={{ width: 600, padding: 20, background: '#FAF8F3' }}>
            {chartType === 'pitching_arsenal' ? (
              // TODO: <PitchingArsenalChart playerId={playerId} />
              <div style={placeholderStyle}>
                [Pitching arsenal chart placeholder — swap in real component]
              </div>
            ) : (
              // TODO: <OverlayChart playerId={playerId} statA={statA} statB={statB}
              //         gameStart={gameStart} gameEnd={gameEnd} />
              <div style={placeholderStyle}>
                [Overlay chart placeholder — swap in real component]
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={handleCapture}
          disabled={!playerId.trim() || capturing}
          style={{ ...primaryBtnStyle, opacity: playerId.trim() ? 1 : 0.4, marginTop: 8 }}
        >
          {capturing ? 'Capturing…' : 'Insert chart'}
        </button>

        {error && <div style={{ marginTop: 10, fontSize: 12, color: '#c0392b' }}>{error}</div>}
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(26,26,26,0.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};
const modalStyle: React.CSSProperties = {
  background: '#FAF8F3', border: '1px solid #1A1A1A', padding: 24,
  width: 460, maxHeight: '90vh', overflowY: 'auto',
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
  opacity: 0.6, marginBottom: 6,
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 10px', border: '1px solid #1A1A1A',
  background: '#fff', fontFamily: 'inherit', fontSize: 14,
};
const closeBtnStyle: React.CSSProperties = {
  border: 'none', background: 'none', cursor: 'pointer', fontSize: 16,
};
const primaryBtnStyle: React.CSSProperties = {
  width: '100%', padding: 12, background: '#1A1A1A', color: '#FAF8F3',
  border: 'none', fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer',
};
const placeholderStyle: React.CSSProperties = {
  height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: '1px dashed #1A1A1A', fontSize: 12, opacity: 0.5, textAlign: 'center', padding: 20,
};