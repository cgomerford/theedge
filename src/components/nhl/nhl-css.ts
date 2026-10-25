// src/components/nhl/nhl-css.ts
//
// Plain CSS @media rules for the NHL preview page -- Tailwind's `lg:` classes
// are unreliable under Turbopack (CLAUDE.md), so every responsive layout here
// is a real stylesheet rule, same pattern as team/ui.tsx's .tp-grid-2 etc.
// No `lg:` class anywhere in this file or in Preview.tsx.

export const NHL_CSS = `
.nhl-hero-grid{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:16px}
.nhl-grid-2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.nhl-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
.nhl-nav a{font-family:var(--font-redhat), sans-serif;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#5b5347;text-decoration:none;padding:6px 10px;border-radius:999px;white-space:nowrap}
.nhl-nav a:hover{background:#1A1A1A;color:#FAF8F3}
@media (min-width:1024px){
  .nhl-grid-2-wide{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media (max-width:900px){
  .nhl-hero-grid{grid-template-columns:1fr;text-align:center}
  .nhl-grid-2{grid-template-columns:1fr}
}
`
