'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';

export default function MaintenanceContent() {
  const searchParams = useSearchParams();
  const from = searchParams.get('from') || '/';

  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const res = await fetch('/api/maintenance-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    setLoading(false);

    if (res.ok) {
      window.location.href = from;
    } else {
      setError('Incorrect password');
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FAF8F3',
        color: '#1A1A1A',
        textAlign: 'center',
        padding: '24px',
      }}
    >
      <div
        style={{
          fontFamily: '"Bebas Neue", sans-serif',
          fontSize: 'clamp(40px, 8vw, 72px)',
          letterSpacing: '0.02em',
          color: '#FF5722',
          lineHeight: 1,
          marginBottom: '16px',
        }}
      >
        THE EDGE
      </div>

      <div
        style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: '13px',
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          marginBottom: '28px',
        }}
      >
        ⊕ Currently Improving
      </div>

      <h1
        style={{
          fontFamily: '"Fraunces", serif',
          fontSize: 'clamp(24px, 4vw, 34px)',
          fontWeight: 500,
          maxWidth: '560px',
          lineHeight: 1.3,
          marginBottom: '16px',
        }}
      >
        We&apos;re rebuilding this page to be faster and sharper.
      </h1>

      <p
        style={{
          fontFamily: '"Fraunces", serif',
          fontSize: '17px',
          maxWidth: '460px',
          lineHeight: 1.6,
          opacity: 0.75,
          marginBottom: '32px',
        }}
      >
        New features roll out <strong>September 18</strong>. In the meantime, the
        homepage is still live.
      </p>

      
        <a href="/"
        style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: '13px',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          backgroundColor: '#1A1A1A',
          color: '#FAF8F3',
          padding: '14px 28px',
          textDecoration: 'none',
          marginBottom: '40px',
        }}
      >
        § Back to Home
      </a>

      {(process.env.NODE_ENV as string) !== 'production' && (
        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '260px' }}
        >
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Preview access"
            style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: '13px',
              padding: '12px 14px',
              border: '1px solid #1A1A1A',
              borderRadius: 0,
              backgroundColor: 'transparent',
            }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: '13px',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              backgroundColor: '#FF5722',
              color: '#FAF8F3',
              border: 'none',
              borderRadius: 0,
              padding: '12px',
              cursor: 'pointer',
            }}
          >
            {loading ? 'Checking…' : 'Unlock'}
          </button>
          {error && (
            <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '12px', color: '#FF5722' }}>
              {error}
            </div>
          )}
        </form>
      )}
    </div>
  );
}