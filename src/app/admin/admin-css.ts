// src/app/admin/admin-css.ts
//
// Shared stylesheet for the admin dashboard and admin archive pages.

export const css = `
.admin {
  background: #FAF8F3;
  color: #1A1A1A;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  min-height: 100vh;
  padding: 0 24px 80px;
}

.admin .wrap {
  max-width: 1480px;
  margin: 0 auto;
}

/* ── Topbar ─────────────────────────────────────── */
.admin .topbar {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  border-bottom: 3px solid #1A1A1A;
  padding: 24px 0 16px;
  margin-bottom: 28px;
  flex-wrap: wrap;
  gap: 8px;
}
.admin .brand {
  font-family: Fraunces, Georgia, serif;
  font-weight: 900;
  font-size: 28px;
  letter-spacing: -0.5px;
}
.admin .brand .mark { color: #FF5722; }
.admin .brand .sub {
  font-weight: 400;
  font-size: 15px;
  color: #6b6b66;
}
.admin .topmeta {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: #6b6b66;
}

/* ── Grid rows ──────────────────────────────────── */
.admin .row {
  display: grid;
  gap: 24px;
  margin-bottom: 24px;
}
.admin .row-1 { grid-template-columns: 1fr; }
.admin .row-2 { grid-template-columns: 1fr 1fr; }

/* ── Section cards ──────────────────────────────── */
.admin .sec {
  margin-bottom: 0;
}
.admin .sec.card {
  background: #fff;
  border: 1px solid #1A1A1A14;
  border-radius: 6px;
  padding: 20px 22px 22px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}
.admin .sechead {
  display: flex;
  align-items: baseline;
  gap: 10px;
  border-bottom: 1px solid #1A1A1A12;
  padding-bottom: 10px;
  margin-bottom: 16px;
}
.admin .sechead .glyph {
  color: #FF5722;
  font-size: 18px;
}
.admin .sechead h2 {
  font-family: Fraunces, Georgia, serif;
  font-weight: 600;
  font-size: 19px;
  letter-spacing: -0.3px;
  margin: 0;
}
.admin .sechead .tag {
  margin-left: auto;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1.4px;
  color: #6b6b66;
  white-space: nowrap;
}

/* ── Empty state ────────────────────────────────── */
.admin .empty {
  border: 1px dashed #1A1A1A1a;
  padding: 18px;
  font-size: 13px;
  color: #6b6b66;
  background: #fafafa;
  border-radius: 4px;
}

/* ── Yesterday performance ──────────────────────── */
.admin .yday {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 28px;
  align-items: center;
}
.admin .record {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 92px;
  line-height: 0.82;
  letter-spacing: 1px;
}
.admin .record small {
  display: block;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: #6b6b66;
  margin-top: 8px;
}
.admin .ydstats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px 20px;
}
.admin .stat .n {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 32px;
  line-height: 1;
  color: #FF5722;
}
.admin .stat .l {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #6b6b66;
  margin-top: 3px;
}
.admin .extremes {
  grid-column: 1 / -1;
  border-top: 1px dashed #1A1A1A1a;
  padding-top: 14px;
  margin-top: 4px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  font-size: 12px;
}
.admin .extremes .ok { color: #15803d; font-weight: 700; }
.admin .extremes .miss { color: #FF5722; font-weight: 700; }

/* ── Reads list ─────────────────────────────────── */
.admin .reads-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 520px;
  overflow-y: auto;
  padding-right: 4px;
}
.admin .read {
  display: grid;
  grid-template-columns: 30px 1fr auto;
  gap: 12px;
  align-items: center;
  border: 1px solid #1A1A1A12;
  border-left: 4px solid #1A1A1A12;
  padding: 11px 13px;
  background: #fafafa;
  border-radius: 3px;
}
.admin .read.top {
  border-left-color: #FF5722;
  background: #fff7f4;
}
.admin .rank {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 24px;
  color: #6b6b66;
  text-align: center;
}
.admin .read.top .rank { color: #FF5722; }
.admin .matchup {
  font-weight: 700;
  font-size: 14px;
}
.admin .submeta {
  font-size: 11px;
  color: #6b6b66;
  margin-top: 2px;
}
.admin .submeta .star {
  color: #FF5722;
  font-weight: 700;
}
.admin .edge {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 32px;
  text-align: right;
  line-height: 1;
}
.admin .edge small {
  display: block;
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  letter-spacing: 1px;
  color: #6b6b66;
  text-transform: uppercase;
}
.admin .lin-ok { color: #15803d; }
.admin .lin-wait { color: #6b6b66; }

/* ── Footnote ───────────────────────────────────── */
.admin .footnote {
  font-size: 11px;
  color: #6b6b66;
  border-top: 1px solid #1A1A1A1a;
  padding-top: 16px;
  margin-top: 32px;
  line-height: 1.7;
}

/* ── Responsive ─────────────────────────────────── */
@media (max-width: 1100px) {
  .admin .row-2 {
    grid-template-columns: 1fr;
  }
  .admin .yday {
    grid-template-columns: 1fr;
    gap: 16px;
  }
  .admin .record {
    font-size: 76px;
  }
}

@media (max-width: 600px) {
  .admin {
    padding: 0 12px 60px;
  }
  .admin .sec.card {
    padding: 16px;
  }
  .admin .read {
    grid-template-columns: 24px 1fr;
    gap: 8px;
  }
  .admin .edge {
    grid-column: 2;
    text-align: left;
    margin-top: 4px;
  }
  .admin .extremes {
    grid-template-columns: 1fr;
  }
}
`