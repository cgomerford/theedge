// src/components/admin/story/ttoValidate.ts
//
// Times-through-the-order PAs must be monotone (1st ≥ 2nd ≥ 3rd) and each have
// a real sample; the weekly script has a known undercount, so a split that
// fails is shown as "—" rather than as a number we can't stand behind.

export const MIN_TTO_PA = 40

export function validTto(pa: (number | null | undefined)[]): boolean {
  if (pa.length !== 3 || pa.some(v => v == null || !Number.isFinite(v))) return false
  const [a, b, c] = pa as number[]
  return a >= b && b >= c && a >= MIN_TTO_PA && b >= MIN_TTO_PA && c >= MIN_TTO_PA
}
