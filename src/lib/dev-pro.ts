// Local-only Pro preview. Pro is never forced on automatically: add ?pro=1 to a page under `next dev`.
// In any deployed build (NODE_ENV 'production') this always returns false.
export function devPro(flag: string | undefined): boolean {
  return process.env.NODE_ENV === 'development' && flag === '1'
}
