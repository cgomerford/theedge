// src/lib/ordinal.ts — 1 → "1st", 22 → "22nd", 13 → "13th".
// Deliberately dependency-free: client components (the player page) import it
// through components/team/ui.tsx, and it must NOT drag any server-only module
// (Supabase admin client, React's server-only cache()) into the browser bundle.
export function ordinal(n: number): string {
  const v = n % 100
  if (v >= 11 && v <= 13) return `${n}th`
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`
}
